# Architecture

A high-level walkthrough of how the platform works end-to-end. For module-level details, follow the file references.

## The five phases

```
1. ingest    git clone or local scan       parser-agent.ts          → ParsedCodebase
2. analyze   Claude streaming               analyzer-agent.ts        → AnalysisResult (Mermaid + files + tech + infra)
3. infer     rules + LLM refine             inference-engine.ts      → ServiceRecommendation[]
4. plan      user picks services            (web UI / CLI)           → DeploymentPlan
5. deploy    agents → terraform apply       deployment-orchestrator  → DeploymentResult + live MessageBus
```

After deploy, monitoring is a sixth, ongoing phase: cost / metrics / logs collectors poll cloud APIs and stream to the dashboard.

## Two surfaces, one core

- **CLI** (`bin/launch.ts`): terminal wizard using `@clack/prompts`.
- **Web** (`web/app/page.tsx`): Next.js single-page app at `localhost:3000`.

Both call the same `src/` modules. The web has its own `node_modules` (Next, React, Tailwind, Recharts) and imports cross-dir via `@core/*` tsconfig path. See `web/next.config.mjs` for `outputFileTracingRoot` and `extensionAlias` config that makes `.js` imports resolve to `.ts` source files.

## Agents and the orchestrator

A `DeploymentAgent` (`src/agents/agent-base.ts`) is the unit of cloud-resource provisioning. One per service: `EC2Agent`, `RDSAgent`, `ApiGatewayAgent`, `BigQueryAgent`, etc.

Lifecycle:
```
provision()  → write Terraform .tf to <artifactDir>/main.tf, publish outputs
configure()  → post-write tweaks (logs only by default)
deploy()     → per-agent post-apply work (mostly stub today; real apply is shared)
validate()   → health checks (mostly stub today)
```

The `DeploymentOrchestrator` (`src/agents/deployment-orchestrator.ts`):

1. Calls `createAgent(rec)` from `agent-registry.ts` for each recommendation.
2. Runs them tier-by-tier in topo-sorted order from `inferenceEngine.buildDependencyOrder`. Each tier executes in parallel via `Promise.allSettled`.
3. Inter-agent values flow through the `MessageBus` (`src/agents/message-bus.ts`). When an agent does `await this.waitFor("vpc", "vpcId")`, it blocks until the VPC agent emits that output.
4. After all per-tier `provision()` runs complete, if `applyMode` is on, `terraform-runner.ts` merges every `<workdir>/artifacts/terraform/<provider>/<id>/main.tf` into a single `_root/<id>.tf`, writes `provider.tf`, then runs `terraform init && terraform apply`. stdout streams as MessageBus log events.

This single-stack merge is why agents publish Terraform interpolation strings (`"${aws_vpc.main.id}"`) rather than literal values — Terraform resolves them at apply time across the unified stack.

## Inference

`src/inference/rules/*.ts` — one file per category (compute, database, network, api, events, ml, k8s, search, analytics, workflows, ...). Each takes a `ParsedCodebase` and returns `ServiceRecommendation[]`. Detection is shallow regex / package.json checks — fast and low-false-positive, but won't catch everything (no AST/import-graph analysis).

`src/inference/inference-engine.ts:inferServices` calls all rules and dedupes. `src/inference/llm-refiner.ts:refineRecommendations` then asks Claude Haiku to remove/adjust based on the actual codebase context.

## Web data flow

```
Browser                       Next.js (Node runtime)
─────                          ─────
[ANALYZE]   ──POST /api/analyze──►   parser-agent → analyzer-agent
                          ◄── SSE ───  parse-progress / chunk / analysis events

[INFER]     ──POST /api/infer───►    inference-engine + llm-refiner (haiku)
                          ◄──JSON ───  recommendations[]

[PLAN]      ──POST /api/plan ───►    persists DeploymentPlan to .launch/web/<sid>/

[DEPLOY]    ──POST /api/deploy──►   new DeploymentOrchestrator → execute()
                          ◄── SSE ───  MessageBus events (status/log/error/output)

dashboard:
  GET /api/monitor/cost    SSE every 30s, estimateCosts + fetchRealCosts (Cost Explorer)
  GET /api/monitor/metrics SSE every 15s, collectMetrics (CloudWatch)

[STOP/DESTROY] POST /api/services/:id/toggle → orchestrator.destroyService(id)
                                                (in-process registry keyed by planId)

[MIGRATE]      POST /api/migrate → MigrationOrchestrator.startTarget()
```

In-process state lives in `web/lib/bus-registry.ts` (Map of `planId → orchestrator`). Survives within one Node process; not horizontally scalable. Session metadata persists to `.launch/web/<sid>/session.json`.

## Credentials

Two paths:
1. **Inherited from shell** — `AWS_*`, `GOOGLE_APPLICATION_CREDENTIALS`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` from the env Next sees on boot.
2. **Pasted into the UI** — `web/components/AuthPanel.tsx` POSTs to `/api/credentials`, which calls `setAWSCredentials` / `setGCPCredentials` / `setGitHubToken` in `web/lib/credential-store.ts`. Credentials are written to `process.env` (so the AWS SDK and child terraform pick them up). GCP service-account JSON is staged at `$TMPDIR/launch-platform-creds/gcp-sa.json` (mode 0600).

This is intentionally local-only. There's no encrypted vault, no per-user isolation. Hosting this as a SaaS would require redesigning this layer (see "Out of scope" in the roadmap).

## Lifecycle and destroy

Per-agent state is one of `running | stopped | destroyed`, stored in `StateStore` (`src/state/store.ts`) and the orchestrator's in-memory `lifecycleStates` map.

- **destroy(serviceId)** — runs `terraform destroy -auto-approve` in the agent's artifact dir. Blocked if any dependents are still `running` — destroy them first.
- **stop(serviceId)** — service-specific scale-to-zero (Lambda concurrency=0, ECS desired_count=0, App Runner pause). Most agents return "unsupported" by default.
- **destroyAll()** — walks reverse topological order; tears down everything.

## Migration

`src/agents/migration-orchestrator.ts` owns two `DeploymentPlan`s — source (running) + target (new provider). Phase 1: deploy target in parallel, source untouched. Phase 2: user clicks `decommissionSource` → source `destroyAll()`. **Data is not migrated** in v1 — this only handles infrastructure. For real DB/storage migration, use AWS DMS, GCP DMS, or `gsutil rsync` separately.

## Where to look

- Agent shapes — `src/agents/agents/_template-agent.ts`
- Agent base class — `src/agents/agent-base.ts:20`
- Adding a service — `docs/contributing/adding-an-agent.md`
- Inference rules — `src/inference/rules/database.ts` (cleanest reference)
- Web routes — `web/app/api/*/route.ts`
- Live state — `web/lib/store.ts` (Zustand) and `web/lib/bus-registry.ts`
- TF runner — `src/agents/terraform-runner.ts:21`
