# launch

Multi-cloud deployment platform. Point it at a codebase, it analyzes it with Claude, infers the cloud services it needs, generates Terraform, and deploys.

```
npm install
cd web && npm install && cd ..
npm run web      # http://localhost:3000
```

Paste a public GitHub URL or local absolute path → see streaming analysis → pick services → deploy. Supports AWS and GCP, local-only mode (your creds, your machine).

## What it does

```
codebase ──► analyze ──► infer services ──► plan ──► deploy ──► monitor
            (Claude)    (rules + LLM)      (TF)     (apply)    (live cost / logs)
```

- **Analyze**: streams a file-by-file walkthrough, Mermaid architecture diagram, tech stack, infra requirements (Claude Sonnet).
- **Infer**: rule-based engine (regex over package.json + file contents) recommends specific services per provider; Claude Haiku optionally refines confidence.
- **Plan**: builds a `DeploymentPlan` with selected services, region, apply mode.
- **Deploy**: per-service "agents" each generate a Terraform file. The orchestrator merges them into one stack and runs `terraform init && terraform apply`. MessageBus events stream live to the UI.
- **Monitor**: AWS Cost Explorer + CloudWatch, GCP Billing/Monitoring (when creds present). Per-service on/off + destroy. Migrate to other provider with parallel deploy.

## Repo layout

```
launch-platform/
├── bin/launch.ts                # CLI entry (terminal wizard)
├── cmd/launch/main.go           # legacy Go TUI (alternate entry)
├── src/                         # core TypeScript
│   ├── agents/                  # one DeploymentAgent per cloud service
│   │   ├── agent-base.ts        # abstract base + lifecycle
│   │   ├── agent-registry.ts    # serviceId → AgentClass mapping
│   │   ├── deployment-orchestrator.ts
│   │   ├── terraform-runner.ts  # spawns terraform, streams logs
│   │   ├── migration-orchestrator.ts
│   │   ├── message-bus.ts       # EventEmitter for inter-agent IO
│   │   └── agents/              # 40+ per-service agents
│   ├── analysis/                # parser-agent + Claude analyzer
│   ├── inference/               # rule-based + LLM-refined inference
│   │   └── rules/               # one file per inference category
│   ├── monitoring/              # cost / metrics / logs collectors
│   ├── execution/               # legacy sync TF runner (still used by CLI)
│   ├── state/                   # store / journal / lock
│   ├── templates/               # placeholder TF assets (lambda code, firestore.rules)
│   └── types/                   # plan, cloud, events
└── web/                         # Next.js single-page app
    ├── app/api/                 # SSE route handlers
    ├── components/              # InputPanel, ServiceGrid, DeployTimeline, CostChart, ...
    └── lib/                     # core re-exports, bus-registry, sessions, sse, store
```

## Quick start

**Prerequisites:**
- Node 22+ with npm
- Terraform 1.5+ on `PATH`
- AWS or GCP credentials (or paste them via the UI's auth bar)

**Run:**
```
npm install
cd web && npm install && cd ..
npm run web              # opens http://localhost:3000
```

**Optional:** put a GitHub token in `web/.env` to avoid the 60-req/hour anonymous limit:
```
GITHUB_TOKEN=github_pat_...
```

## Adding a new agent

There are 40+ agents covering AWS and GCP. To add another, see [docs/contributing/adding-an-agent.md](docs/contributing/adding-an-agent.md). Tl;dr:

1. Copy `src/agents/agents/_template-agent.ts` to `<id>-agent.ts`.
2. Implement `provision()` — write `main.tf`, publish outputs.
3. Register in `src/agents/agent-registry.ts`.
4. Add an inference rule in `src/inference/rules/` so the engine recommends it.
5. Add a cost entry in `src/monitoring/collectors/cost.ts` and `web/components/ServiceGrid.tsx`.
6. `npm run smoke -- --agent <id>` to confirm terraform validates.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full walkthrough — how analyze streams, how the orchestrator merges per-agent .tf files into one stack, how SSE bridges MessageBus to the browser, how lifecycle (running / stopped / destroyed) and migration work.

## Status

This is an active OSS project, **not yet 1.0**. The web UI works end-to-end in artifact mode. Apply mode deploys real cloud resources via terraform — verified against AWS. Some agents are still B-tier (sane defaults but limited config knobs); see the gap analysis in `docs/architecture.md` for what's production-grade vs work-in-progress.

## License

See [LICENSE](LICENSE).
