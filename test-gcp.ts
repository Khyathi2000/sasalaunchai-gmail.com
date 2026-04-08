#!/usr/bin/env tsx
/**
 * GCP end-to-end test — verifies full GCP pipeline:
 * parse → infer (GCP) → agents → Terraform artifacts → cost estimates
 */
import { resolve } from "path";
import { mkdirSync, existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
dotenv.config();

import { runParserAgent } from "./src/analysis/parser-agent.js";
import { inferServices, buildDependencyOrder } from "./src/inference/inference-engine.js";
import { DeploymentOrchestrator } from "./src/agents/deployment-orchestrator.js";
import { estimateCosts } from "./src/monitoring/collectors/cost.js";
import type { DeploymentPlan } from "./src/types/plan.js";
import chalk from "chalk";

const LINE = chalk.gray("═".repeat(64));

async function main() {
  // Test against Sakura AI (rich Next.js + Prisma app)
  const source = resolve("C:/Users/saipr/OneDrive/Desktop/Sakura AI/sakuraAI");
  const workDir = resolve("./.launch-gcp-test");
  mkdirSync(workDir, { recursive: true });

  console.log(`\n${LINE}`);
  console.log(chalk.cyan.bold("  SASA LAUNCH — GCP END-TO-END TEST"));
  console.log(chalk.gray("  Provider: Google Cloud Platform"));
  console.log(LINE);

  // Step 1: Parse
  console.log(chalk.white.bold("\n  [1/5] Parsing codebase...\n"));
  const codebase = await runParserAgent(source, (msg) => {
    process.stdout.write(chalk.gray(`\r    ${msg.slice(0, 70).padEnd(70)}`));
  });
  console.log();
  console.log(chalk.green(`  ✓ Parsed: ${codebase.files.length} files, ${codebase.techStack.length} technologies`));
  console.log(`    Tech: ${codebase.techStack.join(", ")}`);

  // Step 2: Infer GCP services
  console.log(chalk.white.bold("\n  [2/5] Inferring GCP services...\n"));
  const recommendations = inferServices(codebase, undefined, "gcp");

  console.log(`    ${"Service".padEnd(22)} ${"Category".padEnd(18)} ${"Confidence"}`);
  console.log(chalk.gray(`    ${"─".repeat(58)}`));
  for (const r of recommendations) {
    const color = r.confidence === "high" ? chalk.green : r.confidence === "medium" ? chalk.yellow : chalk.red;
    console.log(`    ${r.serviceName.padEnd(22)} ${r.category.padEnd(18)} ${color(r.confidence)}`);
  }
  console.log(chalk.green(`\n  ✓ ${recommendations.length} GCP services inferred`));

  // Step 3: Dependency graph
  console.log(chalk.white.bold("\n  [3/5] Dependency graph...\n"));
  const tiers = buildDependencyOrder(recommendations);
  for (let i = 0; i < tiers.length; i++) {
    const names = tiers[i].map(id => recommendations.find(r => r.serviceId === id)?.serviceName || id);
    console.log(`    Tier ${i + 1}: ${names.join(" + ")}${names.length > 1 ? chalk.gray(" (parallel)") : ""}`);
  }

  // Step 4: Deploy agents
  console.log(chalk.white.bold("\n  [4/5] Running GCP deployment agents...\n"));

  const plan: DeploymentPlan = {
    source,
    provider: "gcp",
    region: "us-central1",
    services: recommendations.map(r => ({ serviceId: r.serviceId, config: r.config })),
    workDir,
    applyMode: false,
    gcpCredentials: { projectId: "sasa-launch-test", email: "test@example.com", authenticated: false },
  };

  // Set GCP project ID for artifact writer
  (globalThis as Record<string, unknown>).__gcpProjectId = "sasa-launch-test";

  const orchestrator = new DeploymentOrchestrator(plan, recommendations);
  const bus = orchestrator.getBus();

  bus.on("message", (msg: { from: string; type: string; payload: { status?: string; message?: string } }) => {
    if (msg.type === "status" && (msg.payload.status === "done" || msg.payload.status === "error")) {
      const color = msg.payload.status === "done" ? chalk.green : chalk.red;
      console.log(`    ${color("●")} ${msg.from.padEnd(28)} ${color(msg.payload.status!.toUpperCase())}`);
    }
  });

  const result = await orchestrator.execute();

  console.log();
  if (result.success) {
    console.log(chalk.green(`  ✓ All ${result.agents.length} GCP agents completed`));
  } else {
    console.log(chalk.red(`  ✗ Failed: ${result.error}`));
  }

  // Step 5: Check artifacts
  console.log(chalk.white.bold("\n  [5/5] Generated GCP Terraform artifacts...\n"));

  const tfDir = join(workDir, "artifacts", "terraform", "gcp");
  let totalLines = 0;

  if (existsSync(tfDir)) {
    const modules = readdirSync(tfDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const mod of modules) {
      const files = readdirSync(join(tfDir, mod.name));
      let lines = 0;
      for (const f of files) {
        lines += readFileSync(join(tfDir, mod.name, f), "utf-8").split("\n").length;
      }
      totalLines += lines;
      console.log(`    ${chalk.bold(mod.name.padEnd(22))} ${files.join(", ").padEnd(16)} ${lines} lines`);
    }
    console.log();
    console.log(chalk.green(`  ✓ ${modules.length} Terraform modules, ${totalLines} lines of GCP IaC`));
  }

  // Cost estimate
  const costs = estimateCosts(recommendations.map(r => r.serviceId));
  console.log();
  console.log(`    GCP Estimated Cost: ${chalk.yellow("$" + costs.totalDaily.toFixed(2) + "/day")} | ${chalk.yellow("$" + costs.totalMonthly.toFixed(2) + "/month")}`);

  // Summary
  console.log(`\n${LINE}`);
  console.log(chalk.cyan.bold("  GCP TEST RESULTS"));
  console.log(LINE);
  console.log(`    Codebase:    ${codebase.repoName} (${codebase.totalFiles} files)`);
  console.log(`    Provider:    GCP (us-central1)`);
  console.log(`    Services:    ${recommendations.length} inferred`);
  console.log(`    Agents:      ${result.agents.length} executed (${result.agents.filter(a => a.status === "done").length} succeeded)`);
  console.log(`    Terraform:   ${totalLines} lines across GCP modules`);
  console.log(`    Est. Cost:   $${costs.totalMonthly.toFixed(2)}/month`);
  console.log(`    Result:      ${result.success ? chalk.green.bold("✓ SUCCESS") : chalk.red.bold("✗ FAILED")}`);
  console.log();
}

main().catch(err => {
  console.error(chalk.red(`\nFatal: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
