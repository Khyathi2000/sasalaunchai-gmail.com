# launch

Multi-cloud deployment platform. Sign in with GitHub, point Launch at any repo you can access, it analyzes the codebase with Claude, infers the cloud services it needs, generates Terraform, and deploys.

```
npm install
npm run dev      # http://localhost:3000
```

Sign in with GitHub → paste a repo URL or local path → see streaming analysis → pick services → deploy. Supports AWS and GCP; cloud creds stay in the dev process / Cloud Run runtime, not in any third-party DB.

## What it does

```
codebase ──► analyze ──► infer services ──► plan ──► deploy ──► monitor
            (Claude)    (rules + LLM)      (TF)     (apply)    (live cost / logs)
```

- **Analyze**: streams a file-by-file walkthrough, Mermaid architecture diagram, tech stack, infra requirements (Claude Sonnet).
- **Infer**: rule-based engine (regex over package.json + file contents) recommends specific services per provider; Claude Haiku optionally refines confidence.
- **Plan**: builds a `DeploymentPlan` with selected services, region, apply mode.
- **Deploy**: per-service "agents" each generate a Terraform file. The orchestrator merges them into one stack and runs `terraform init && terraform apply`. MessageBus events stream live to the UI over SSE.
- **Monitor**: AWS Cost Explorer + CloudWatch, GCP Billing/Monitoring (when creds present). Per-service on/off + destroy. Migrate to other provider with parallel deploy.

## Repo layout

```
launch-platform/
├── Dockerfile           # multi-stage: terraform CLI + Next standalone
├── cloudbuild.yaml      # Cloud Build → Artifact Registry → Cloud Run
├── scripts/             # gcp bootstrap + secret loaders
├── app/                 # Next.js App Router
│   ├── api/             # SSE route handlers (analyze, deploy, monitor, ...)
│   ├── login/[[...rest]]/   # Clerk sign-in
│   ├── signup/[[...rest]]/  # Clerk sign-up
│   ├── app/             # main dashboard
│   └── page.tsx         # landing
├── components/          # InputPanel, ServiceGrid, DeployTimeline, CostChart, ...
├── lib/
│   ├── auth/            # Clerk → GitHub OAuth token helper
│   ├── core.ts          # re-exports of src/core/* for route handlers
│   ├── firestore.ts     # session backend (ADC on Cloud Run)
│   └── sessions.ts      # Firestore-backed session store
├── middleware.ts        # Clerk middleware (protects /app + /api/*)
└── src/core/            # core TypeScript called by route handlers
    ├── agents/          # 40+ DeploymentAgents + orchestrator + terraform-runner
    ├── analysis/        # parser-agent + Claude analyzer
    ├── inference/       # rule-based + LLM-refined service inference
    ├── monitoring/      # cost / metrics / health collectors
    ├── state/           # store / journal / lock
    ├── templates/       # placeholder TF assets (lambda code, firestore.rules)
    └── types/           # plan, cloud, events
```

## Quick start

**Prerequisites:**
- Node 22+ with npm
- Terraform 1.5+ on `PATH` (for actual deploys; not needed to just browse the UI)
- Clerk account with GitHub social connection enabled (scopes: `repo read:user`)
- AWS or GCP credentials when you're ready to deploy (paste them in the UI's auth bar)

**Environment** (`.env.local` at the repo root — see `.env.example`):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
ANTHROPIC_API_KEY=sk-ant-...
```

**Run:**
```
npm install
npm run dev      # http://localhost:3000
```

## Deploy to Cloud Run

```
gcloud builds submit --config=cloudbuild.yaml
```

The Dockerfile produces a Next standalone image with `terraform` on PATH; Cloud Build pushes to Artifact Registry and deploys to Cloud Run. Sessions persist in Firestore via Application Default Credentials (the runtime service account `sasa-runtime`).

When wiring Clerk into prod: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must be available at **build time** (it's inlined into client bundles) — pass it as a Cloud Build substitution / `--build-arg`. `CLERK_SECRET_KEY` is a runtime secret — add it to `--set-secrets` in `cloudbuild.yaml`.

## Adding a new agent

There are 40+ agents covering AWS and GCP. To add another:

1. Copy `src/core/agents/agents/_template-agent.ts` to `<id>-agent.ts`.
2. Implement `provision()` — write `main.tf`, publish outputs.
3. Register in `src/core/agents/agent-registry.ts`.
4. Add an inference rule in `src/core/inference/rules/`.
5. Add a cost entry in `src/core/monitoring/collectors/cost.ts` and a service-grid entry in `components/ServiceGrid.tsx`.

## Status

Active OSS project, **not yet 1.0**. The web UI works end-to-end in artifact mode. Apply mode deploys real cloud resources via terraform — verified against AWS. Some agents are still B-tier (sane defaults but limited config knobs).

## License

See [LICENSE](LICENSE).
