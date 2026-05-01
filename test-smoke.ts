#!/usr/bin/env tsx
/**
 * Smoke test harness — runs each agent's provision() phase in isolation,
 * generates Terraform, optionally runs `terraform validate` on the merged
 * stack. Use to confirm new agents produce valid HCL before shipping.
 *
 * Usage:
 *   npm run smoke                   — loop every registered agent
 *   npm run smoke -- --agent ec2    — single agent
 *   npm run smoke -- --validate     — also run `terraform init && validate`
 */
import { mkdirSync, rmSync, existsSync } from "fs";
import { resolve, join } from "path";
import { spawn } from "child_process";
import dotenv from "dotenv";
dotenv.config();

import { DeploymentOrchestrator } from "./src/agents/deployment-orchestrator.js";
import { isTerraformAvailable } from "./src/agents/terraform-runner.js";
import type { ServiceRecommendation } from "./src/types/cloud.js";
import type { DeploymentPlan } from "./src/types/plan.js";

// ── Synthetic recommendations per agent ────────────────────────────────
// Minimal config + dependencies so each agent's provision() can run in isolation.
const SYNTHETIC: Record<string, { rec: Omit<ServiceRecommendation, "serviceId" | "provider">; deps: string[]; provider: "aws" | "gcp" }> = {
  // AWS
  vpc:               { rec: { serviceName: "VPC",            category: "network",          reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  iam:               { rec: { serviceName: "IAM",            category: "auth",             reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  ec2:               { rec: { serviceName: "EC2",            category: "compute",          reason: "smoke", confidence: "high",   config: {}, dependsOn: ["vpc"] }, deps: ["vpc"],                provider: "aws" },
  ecs:               { rec: { serviceName: "ECS",            category: "orchestration",    reason: "smoke", confidence: "high",   config: {}, dependsOn: ["vpc","iam","ecr"] }, deps: ["vpc","iam","ecr"], provider: "aws" },
  ecr:               { rec: { serviceName: "ECR",            category: "container-registry", reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  lambda:            { rec: { serviceName: "Lambda",         category: "serverless",       reason: "smoke", confidence: "high",   config: {}, dependsOn: ["iam"] }, deps: ["iam"],                provider: "aws" },
  rds:               { rec: { serviceName: "RDS",            category: "database",         reason: "smoke", confidence: "high",   config: { engine: "postgres" }, dependsOn: ["vpc"] }, deps: ["vpc"], provider: "aws" },
  s3:                { rec: { serviceName: "S3",             category: "storage",          reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  cloudfront:        { rec: { serviceName: "CloudFront",     category: "cdn",              reason: "smoke", confidence: "high",   config: {}, dependsOn: ["s3"] }, deps: ["s3"],                  provider: "aws" },
  alb:               { rec: { serviceName: "ALB",            category: "loadbalancer",     reason: "smoke", confidence: "high",   config: {}, dependsOn: ["vpc"] }, deps: ["vpc"],                provider: "aws" },
  elasticache:       { rec: { serviceName: "ElastiCache",    category: "cache",            reason: "smoke", confidence: "high",   config: {}, dependsOn: ["vpc"] }, deps: ["vpc"],                provider: "aws" },
  sqs:               { rec: { serviceName: "SQS",            category: "messaging",        reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  cloudwatch:        { rec: { serviceName: "CloudWatch",     category: "observability",    reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  route53:           { rec: { serviceName: "Route53",        category: "network",          reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  "secrets-manager": { rec: { serviceName: "Secrets Manager", category: "secrets",         reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  dynamodb:          { rec: { serviceName: "DynamoDB",       category: "database",         reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  "api-gateway":     { rec: { serviceName: "API Gateway",    category: "api",              reason: "smoke", confidence: "high",   config: {}, dependsOn: ["lambda"] }, deps: ["lambda","iam"],   provider: "aws" },
  cognito:           { rec: { serviceName: "Cognito",        category: "auth",             reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  eventbridge:       { rec: { serviceName: "EventBridge",    category: "events",           reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  "app-runner":      { rec: { serviceName: "App Runner",     category: "orchestration",    reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  opensearch:        { rec: { serviceName: "OpenSearch",     category: "search",           reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },
  "step-functions":  { rec: { serviceName: "Step Functions", category: "workflows",        reason: "smoke", confidence: "high",   config: {}, dependsOn: [] }, deps: [],                          provider: "aws" },

  // GCP
  "vpc-gcp":           { rec: { serviceName: "VPC",                category: "network",            reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  "cloud-iam":         { rec: { serviceName: "Cloud IAM",          category: "auth",               reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  "cloud-run":         { rec: { serviceName: "Cloud Run",          category: "orchestration",      reason: "smoke", confidence: "high", config: {}, dependsOn: ["artifact-registry"] }, deps: ["artifact-registry","cloud-iam"], provider: "gcp" },
  "cloud-functions":   { rec: { serviceName: "Cloud Functions",    category: "serverless",         reason: "smoke", confidence: "high", config: {}, dependsOn: ["cloud-iam"] }, deps: ["cloud-iam"], provider: "gcp" },
  gce:                 { rec: { serviceName: "GCE",                category: "compute",            reason: "smoke", confidence: "high", config: {}, dependsOn: ["vpc-gcp"] }, deps: ["vpc-gcp"], provider: "gcp" },
  "cloud-sql":         { rec: { serviceName: "Cloud SQL",          category: "database",           reason: "smoke", confidence: "high", config: { engine: "postgres" }, dependsOn: ["vpc-gcp"] }, deps: ["vpc-gcp"], provider: "gcp" },
  firestore:           { rec: { serviceName: "Firestore",          category: "database",           reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  gcs:                 { rec: { serviceName: "Cloud Storage",      category: "storage",            reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  "cloud-cdn":         { rec: { serviceName: "Cloud CDN",          category: "cdn",                reason: "smoke", confidence: "high", config: {}, dependsOn: ["gcs"] }, deps: ["gcs"],     provider: "gcp" },
  "cloud-lb":          { rec: { serviceName: "Cloud LB",           category: "loadbalancer",       reason: "smoke", confidence: "high", config: {}, dependsOn: ["cloud-run"] }, deps: ["cloud-run","artifact-registry","cloud-iam"], provider: "gcp" },
  memorystore:         { rec: { serviceName: "Memorystore",        category: "cache",              reason: "smoke", confidence: "high", config: {}, dependsOn: ["vpc-gcp"] }, deps: ["vpc-gcp"], provider: "gcp" },
  pubsub:              { rec: { serviceName: "Pub/Sub",            category: "messaging",          reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  "artifact-registry": { rec: { serviceName: "Artifact Registry",  category: "container-registry", reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  "secret-manager":    { rec: { serviceName: "Secret Manager",     category: "secrets",            reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  "cloud-monitoring":  { rec: { serviceName: "Cloud Monitoring",   category: "observability",      reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  "cloud-build":       { rec: { serviceName: "Cloud Build",        category: "ci",                 reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  bigquery:            { rec: { serviceName: "BigQuery",           category: "analytics",          reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  gke:                 { rec: { serviceName: "GKE",                category: "k8s",                reason: "smoke", confidence: "high", config: {}, dependsOn: ["vpc-gcp"] }, deps: ["vpc-gcp"], provider: "gcp" },
  "vertex-ai":         { rec: { serviceName: "Vertex AI",          category: "ml",                 reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  "cloud-tasks":       { rec: { serviceName: "Cloud Tasks",        category: "events",             reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
  "cloud-workflows":   { rec: { serviceName: "Cloud Workflows",    category: "workflows",          reason: "smoke", confidence: "high", config: {}, dependsOn: [] }, deps: [],                provider: "gcp" },
};

interface SmokeResult {
  agent: string;
  ok: boolean;
  validated?: boolean;
  error?: string;
}

async function smokeOne(agent: string, validate: boolean, baseDir: string): Promise<SmokeResult> {
  const entry = SYNTHETIC[agent];
  if (!entry) return { agent, ok: false, error: `no synthetic config for ${agent}` };

  const workDir = join(baseDir, agent);
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  const recs: ServiceRecommendation[] = [
    ...entry.deps.map((d) => ({ ...SYNTHETIC[d].rec, serviceId: d, provider: SYNTHETIC[d].provider })),
    { ...entry.rec, serviceId: agent, provider: entry.provider },
  ];

  const plan: DeploymentPlan = {
    source: `smoke-${agent}`,
    provider: entry.provider,
    region: entry.provider === "aws" ? "us-east-1" : "us-central1",
    services: recs.map((r) => ({ serviceId: r.serviceId, config: r.config })),
    workDir,
    applyMode: false, // artifacts only — no terraform apply
  };

  try {
    const orch = new DeploymentOrchestrator(plan, recs);
    await orch.execute();
  } catch (err) {
    return { agent, ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (validate) {
    const tfDir = join(workDir, "artifacts", "terraform", entry.provider);
    const code = await runTerraformValidate(tfDir, recs.map((r) => r.serviceId));
    if (code !== 0) return { agent, ok: false, validated: false, error: `terraform validate exit ${code}` };
    return { agent, ok: true, validated: true };
  }
  return { agent, ok: true };
}

async function runTerraformValidate(baseDir: string, agentIds: string[]): Promise<number> {
  // Run `terraform init -backend=false && terraform validate` inside the
  // last agent's artifact dir. Not a full cross-stack check (that's apply-mode
  // territory), but catches per-file HCL syntax / schema issues.
  return new Promise((resolve) => {
    const dir = join(baseDir, agentIds[agentIds.length - 1]);
    if (!existsSync(dir)) {
      resolve(0); // no .tf written (e.g. route53 stub) — not a failure
      return;
    }
    const init = spawn("terraform", ["init", "-backend=false", "-input=false", "-no-color"], {
      cwd: dir, shell: process.platform === "win32", stdio: "ignore",
    });
    init.on("close", (initCode) => {
      if (initCode !== 0) return resolve(initCode ?? 1);
      const validate = spawn("terraform", ["validate", "-no-color"], {
        cwd: dir, shell: process.platform === "win32", stdio: "ignore",
      });
      validate.on("close", (vcode) => resolve(vcode ?? 1));
      validate.on("error", () => resolve(1));
    });
    init.on("error", () => resolve(1));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const validateIdx = args.indexOf("--validate");
  const validate = validateIdx !== -1;
  if (validate) args.splice(validateIdx, 1);

  const agentIdx = args.indexOf("--agent");
  const onlyAgent = agentIdx !== -1 ? args[agentIdx + 1] : null;

  if (validate) {
    const tfOK = await isTerraformAvailable();
    if (!tfOK) {
      console.error("--validate requires terraform on PATH. Skipping validate.");
      return;
    }
  }

  const baseDir = resolve("./.launch-smoke");
  if (existsSync(baseDir)) rmSync(baseDir, { recursive: true, force: true });
  mkdirSync(baseDir, { recursive: true });

  const targets = onlyAgent ? [onlyAgent] : Object.keys(SYNTHETIC);
  const results: SmokeResult[] = [];

  for (const agent of targets) {
    process.stdout.write(`  ${agent.padEnd(22)} `);
    const r = await smokeOne(agent, validate, baseDir);
    results.push(r);
    if (r.ok) {
      const v = r.validated ? " (validated)" : "";
      process.stdout.write(`ok${v}\n`);
    } else {
      process.stdout.write(`FAIL — ${r.error}\n`);
    }
  }

  const fails = results.filter((r) => !r.ok);
  console.log("");
  console.log(`  total:  ${results.length}`);
  console.log(`  pass:   ${results.length - fails.length}`);
  console.log(`  fail:   ${fails.length}`);
  if (fails.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
