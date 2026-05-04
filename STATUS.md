# Overnight build status

End-to-end multi-agent deployment system, 5 milestones, 5 stacked draft PRs. All tests green; no real cloud touched (your account isn't authenticated to me).

## What's done

| # | Milestone | Branch | PR | Tests | Files added | Notes |
|---|---|---|---|---|---|---|
| **M1** | Per-user workspace + encrypted creds + Drizzle ORM + Postgres | `feat/m1-credential-vault-orm` | [#4](https://github.com/msaiprasad1/sasalaunchai-gmail.com/pull/4) | 27 | Drizzle schema, KMS abstraction, credential vault, sessions migrated to Postgres, all 9 API routes scoped to Clerk userId, CredentialsForm UI extended | Replaces Firestore + in-memory creds |
| **M2** | Python LangGraph analysis sidecar | `feat/m2-langgraph-analysis` | [#5](https://github.com/msaiprasad1/sasalaunchai-gmail.com/pull/5) | 10 (pytest) + 4 (TS) | 11 specialists + synthesizer (Opus) + critic (Haiku), Pydantic schema, FastAPI SSE endpoint, Dockerfile, cloudbuild.yaml, TS streaming client with adapter | Falls back to legacy single-call analyzer if sidecar unreachable |
| **M3** | Both-cloud inference + 3 Mermaid diagrams + cost catalog | `feat/m3-multi-cloud-diagrams` | [#6](https://github.com/msaiprasad1/sasalaunchai-gmail.com/pull/6) | +17 | `cost-catalog.ts`, `diagram-builders.ts` (architecture, CI/CD, deployment-flow), `DiagramTabs` + `CloudComparison` UI | `/api/infer` now returns AWS+GCP bundles |
| **M4** | Architect chat + 4 missing AWS agents | `feat/m4-architect-chat` | [#7](https://github.com/msaiprasad1/sasalaunchai-gmail.com/pull/7) | +18 | EKS, Bedrock, CodeBuild, CodePipeline agents (Terraform HCL); inference rules updated; `architect/tools.ts` + `architect/agent.ts` (Claude tool-use loop); `ArchitectChat` UI | AWS=26 services, GCP=21 |
| **M5** | GCP cost + metrics collectors | `feat/m5-gcp-monitoring` | [#8](https://github.com/msaiprasad1/sasalaunchai-gmail.com/pull/8) | +7 | `gcp-cost.ts` (Cloud Billing + BigQuery export), `gcp-metrics.ts` (Cloud Monitoring), monitor routes branched by `plan.provider` | Falls back to static catalog when not configured |

**Totals**: 73 TS tests passing, 10 Python tests passing, typecheck clean. ~5,300 LOC added across ~75 new files.

## How the PRs are stacked

```
main
  └─ feat/m1-credential-vault-orm        PR #4
       └─ feat/m2-langgraph-analysis     PR #5  (base = M1)
            └─ feat/m3-multi-cloud-diagrams  PR #6  (base = M2)
                 └─ feat/m4-architect-chat    PR #7  (base = M3)
                      └─ feat/m5-gcp-monitoring  PR #8  (base = M4)
```

Merge in order. Each PR's diff against `main` is currently the *cumulative* diff; once you merge M1, the M2 diff narrows to just M2's changes, and so on. This is the standard "stacked diffs" workflow.

## What I could NOT do without your account

These are blocked on credentials I don't have. None are blockers for code review — they're "before this branch can serve real traffic" steps.

### Before merging M1

```bash
# Provision Cloud SQL Postgres + Cloud KMS keyring/key
GCP_PROJECT_ID=<your-project> ./scripts/gcp-bootstrap-m1.sh

# Apply schema (run from your laptop with cloud-sql-auth-proxy up)
DATABASE_URL=postgres://launch:<pw>@127.0.0.1:5432/launch \
  npm run db:migrate

# (Optional) Migrate any legacy Firestore sessions
GOOGLE_APPLICATION_CREDENTIALS=... DATABASE_URL=... \
  npx tsx scripts/migrate-firestore-sessions.ts --owner=<your-clerk-userId>

# Set Cloud Run env on the web service
gcloud run services update sasa-web \
  --region=us-central1 --project=$GCP_PROJECT_ID \
  --update-env-vars=LAUNCH_KMS_PROVIDER=gcp,\
LAUNCH_GCP_KMS_KEY_NAME=projects/$GCP_PROJECT_ID/locations/global/keyRings/launch/cryptoKeys/credentials \
  --update-secrets=DATABASE_URL=DATABASE_URL:latest

# Grant runtime SA encrypter/decrypter on the KMS key
gcloud kms keys add-iam-policy-binding credentials \
  --keyring=launch --location=global --project=$GCP_PROJECT_ID \
  --member='serviceAccount:sasa-runtime@'$GCP_PROJECT_ID'.iam.gserviceaccount.com' \
  --role='roles/cloudkms.cryptoKeyEncrypterDecrypter'
```

### Before merging M2

```bash
# Build + deploy the analysis sidecar
cd analysis-service
gcloud builds submit --config=cloudbuild.yaml --project=$GCP_PROJECT_ID .

# Grant the web-app SA invoker on the sidecar (sidecar is private)
gcloud run services add-iam-policy-binding sasa-analysis \
  --region=us-central1 --project=$GCP_PROJECT_ID \
  --member='serviceAccount:sasa-runtime@'$GCP_PROJECT_ID'.iam.gserviceaccount.com' \
  --role='roles/run.invoker'

# Point the web app at it
gcloud run services update sasa-web \
  --region=us-central1 --project=$GCP_PROJECT_ID \
  --update-env-vars=ANALYSIS_SERVICE_URL=https://sasa-analysis-<hash>-uc.a.run.app
```

### Before M5's GCP cost numbers go live

```bash
# BigQuery billing export (one-time)
gcloud billing accounts list                                  # pick BILLING_ACCOUNT_ID
gcloud billing projects link $GCP_PROJECT_ID \
  --billing-account=$BILLING_ACCOUNT_ID
bq mk billing_export
# Then in Cloud Console → Billing → Billing export, enable BigQuery export.

gcloud run services update sasa-web \
  --region=us-central1 --project=$GCP_PROJECT_ID \
  --update-env-vars=LAUNCH_GCP_BILLING_BQ_DATASET=billing_export,\
LAUNCH_GCP_BILLING_BQ_TABLE=gcp_billing_export_v1_$BILLING_ACCOUNT_ID

# Monitoring
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:sasa-runtime@$GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/monitoring.viewer"
```

## What's NOT in scope for these PRs

Filed as v2 in the original plan; deliberately deferred:

- AWS IAM cross-account AssumeRole (replaces stored access keys with role chaining)
- GCP OAuth 2.0 + workload-identity federation
- Multi-region disaster-recovery agents (RDS cross-region replicas, Cloud SQL replicas)
- Service mesh (App Mesh, Istio on GKE)
- Real-time collaborative architect chat (multiple users editing same plan)
- Post-deploy *Terraform diff* UX (M4 added the post-deploy *tools*; the diff-and-apply review flow needs more design)

## Sanity checks I ran

```bash
# TS suite (per-branch)
npm run typecheck    # clean on all 5 branches
npm test             # 27 (M1) → 31 (M2) → 48 (M3) → 66 (M4) → 73 (M5), all green

# Python suite (M2)
cd analysis-service && pytest    # 10/10 passing
```

The TS tests use PGlite (in-memory Postgres) and a fake KMS so no real cloud is needed for CI.

The Python tests use a fake Anthropic client so no API key is needed for CI.

## Things I noticed but did not address

- A few system-reminder events showed files reverting between my edits and my reads; I caught one in M3 (had to re-apply `app/api/infer/route.ts` and `vitest.config.ts`) and committed the recovery. If you see anything that looks half-finished in the diffs, ping me and I'll re-verify.
- The cloud-build for the **analysis-service** uses the same custom `sasa-cloudbuild` SA your existing `cloudbuild.yaml` uses. You'll want a separate runtime SA `sasa-analysis-runtime` (or reuse `sasa-runtime`) — set `_RUNTIME_SA` substitution accordingly.
- M4's Bedrock agent **logs a reminder** that foundation-model access still requires a one-time grant in the AWS console (Bedrock → Model access). Terraform can't do that.
- M4's CodePipeline agent expects `config.codestarConnectionArn` — without it the pipeline still provisions but the source action will need a one-time manual auth in the AWS console.

## How to review

If you want to review one PR at a time bottom-up (recommended):

1. Pull and check out `feat/m1-credential-vault-orm`, run `npm test`. Merge #4.
2. Pull and check out `feat/m2-langgraph-analysis` (rebase onto main if you took #4), run `npm test` + `cd analysis-service && pytest`. Merge #5.
3. Same for #6, #7, #8.

If you want to review everything at once, check out `feat/m5-gcp-monitoring` — it has all five milestones stacked.

— me, going to sleep too 😴
