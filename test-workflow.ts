#!/usr/bin/env tsx
/**
 * Non-interactive test of the full launch-platform workflow.
 * Points at the sibling "launch" Go repo as the target codebase.
 */
import { resolve } from "path";
import { mkdirSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

import { runParserAgent } from "./src/analysis/parser-agent.js";
import { inferServices, buildDependencyOrder } from "./src/inference/inference-engine.js";
import { DeploymentOrchestrator } from "./src/agents/deployment-orchestrator.js";
import { estimateCosts } from "./src/monitoring/collectors/cost.js";
import { detectAnomalies } from "./src/monitoring/anomaly-detector.js";
import { collectMetrics } from "./src/monitoring/collectors/metrics.js";
import type { DeploymentPlan } from "./src/types/plan.js";
import type { ServiceRecommendation } from "./src/types/cloud.js";
import chalk from "chalk";

const LINE = chalk.gray("─".repeat(60));

async function main() {
  const source = resolve("../launch"); // The Go CLI repo
  const workDir = resolve("./.launch-test");
  mkdirSync(workDir, { recursive: true });

  console.log(chalk.cyan.bold("\n  LAUNCH PLATFORM — WORKFLOW TEST\n"));
  console.log(LINE);

  // ── Step 1: Parse codebase ──────────────────────────────────────────
  console.log(chalk.white.bold("\n  [1/7] Parsing codebase...\n"));
  const codebase = await runParserAgent(source, (msg, count) => {
    console.log(chalk.gray(`    ${msg}`));
  });

  console.log(chalk.green("  ✓ Parse complete"));
  console.log(`    Name:       ${codebase.repoName}`);
  console.log(`    Files:      ${codebase.totalFiles} total, ${codebase.files.length} parsed`);
  console.log(`    Tech stack: ${codebase.techStack.join(", ") || "none detected"}`);
  console.log(`    Languages:  ${[...new Set(codebase.files.map(f => f.language))].join(", ")}`);

  // ── Step 2: Infer services ──────────────────────────────────────────
  console.log(chalk.white.bold("\n  [2/7] Inferring cloud services...\n"));
  const provider = "aws";
  const region = "us-east-1";

  // Skip Claude analysis (no API key needed for rule-based inference)
  const recommendations = inferServices(codebase, undefined, provider);

  console.log(chalk.green(`  ✓ Inferred ${recommendations.length} services`));
  console.log();
  console.log(`    ${"Service".padEnd(20)} ${"Category".padEnd(16)} ${"Confidence".padEnd(12)} Reason`);
  console.log(chalk.gray(`    ${"─".repeat(80)}`));
  for (const r of recommendations) {
    console.log(`    ${r.serviceName.padEnd(20)} ${r.category.padEnd(16)} ${r.confidence.padEnd(12)} ${r.reason.slice(0, 40)}`);
  }

  // ── Step 3: Dependency order ────────────────────────────────────────
  console.log(chalk.white.bold("\n  [3/7] Building dependency graph...\n"));
  const tiers = buildDependencyOrder(recommendations);

  for (let i = 0; i < tiers.length; i++) {
    const tierServices = tiers[i].map(id => {
      const rec = recommendations.find(r => r.serviceId === id);
      return rec?.serviceName || id;
    });
    console.log(`    Tier ${i + 1}: ${tierServices.join(", ")}`);
  }
  console.log(chalk.green(`  ✓ ${tiers.length} execution tiers`));

  // ── Step 4: Cost estimation ─────────────────────────────────────────
  console.log(chalk.white.bold("\n  [4/7] Estimating costs...\n"));
  const costs = estimateCosts(recommendations.map(r => r.serviceId));

  console.log(`    Daily:   ${chalk.yellow("$" + costs.totalDaily.toFixed(2))}`);
  console.log(`    Monthly: ${chalk.yellow("$" + costs.totalMonthly.toFixed(2))}`);
  console.log();
  for (const s of costs.byService.filter(s => s.dailyCost > 0)) {
    console.log(`    ${s.serviceId.padEnd(16)} $${s.dailyCost.toFixed(2)}/day  ($${s.monthlyCost.toFixed(2)}/mo)`);
  }
  console.log(chalk.green("  ✓ Cost estimate ready"));

  // ── Step 5: Run deployment agents (artifact generation) ─────────────
  console.log(chalk.white.bold("\n  [5/7] Running deployment agents...\n"));

  const plan: DeploymentPlan = {
    source,
    provider,
    region,
    services: recommendations.map(r => ({ serviceId: r.serviceId, config: r.config })),
    workDir,
    applyMode: false, // artifact generation only
  };

  const orchestrator = new DeploymentOrchestrator(plan, recommendations);

  // Listen to agent events
  const bus = orchestrator.getBus();
  bus.on("message", (msg: { from: string; type: string; payload: { status?: string; message?: string; key?: string } }) => {
    if (msg.type === "status") {
      const statusColors: Record<string, (s: string) => string> = {
        provisioning: chalk.yellow,
        configuring: chalk.blue,
        validating: chalk.cyan,
        done: chalk.green,
        error: chalk.red,
      };
      const color = statusColors[msg.payload.status || ""] || chalk.white;
      console.log(`    ${msg.from.padEnd(20)} ${color(String(msg.payload.status).toUpperCase().padEnd(14))} ${msg.payload.message || ""}`);
    }
  });

  const result = await orchestrator.execute();

  console.log();
  if (result.success) {
    console.log(chalk.green(`  ✓ All agents completed in ${(result.totalDuration / 1000).toFixed(1)}s`));
  } else {
    console.log(chalk.red(`  ✗ Deployment failed: ${result.error}`));
  }

  // Show agent summary
  console.log();
  console.log(`    ${"Agent".padEnd(20)} ${"Status".padEnd(12)} ${"Outputs"}`);
  console.log(chalk.gray(`    ${"─".repeat(60)}`));
  for (const a of result.agents) {
    const outputKeys = Object.keys(a.outputs).join(", ");
    const statusColor = a.status === "done" ? chalk.green : chalk.red;
    console.log(`    ${a.agentId.padEnd(20)} ${statusColor(a.status.padEnd(12))} ${outputKeys}`);
  }

  // ── Step 6: Check generated artifacts ───────────────────────────────
  console.log(chalk.white.bold("\n  [6/7] Checking generated artifacts...\n"));

  const { readdirSync, existsSync } = await import("fs");
  const { join } = await import("path");
  const tfDir = join(workDir, "artifacts", "terraform", "aws");

  if (existsSync(tfDir)) {
    const services = readdirSync(tfDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const svc of services) {
      const files = readdirSync(join(tfDir, svc.name));
      console.log(`    ${chalk.bold(svc.name.padEnd(16))} ${files.join(", ")}`);
    }
    console.log(chalk.green(`  ✓ ${services.length} Terraform modules generated`));
  }

  const scriptsDir = join(workDir, "artifacts", "scripts");
  if (existsSync(scriptsDir)) {
    const scripts = readdirSync(scriptsDir);
    console.log(`    Scripts: ${scripts.join(", ")}`);
  }

  // ── Step 7: Monitoring check ────────────────────────────────────────
  console.log(chalk.white.bold("\n  [7/7] Monitoring anomaly detection...\n"));

  const metrics = await collectMetrics("ecs", region);
  console.log(`    ECS metrics: CPU=${metrics.cpu?.toFixed(1)}%, MEM=${metrics.memory?.toFixed(1)}%, Errors=${metrics.errorRate?.toFixed(2)}%`);

  const alerts = detectAnomalies(metrics);
  if (alerts.length > 0) {
    for (const a of alerts) {
      const icon = a.severity === "critical" ? chalk.red("✗") : chalk.yellow("⚠");
      console.log(`    ${icon} ${a.message}`);
    }
  } else {
    console.log(chalk.green("    ✓ No anomalies detected"));
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log(`\n${LINE}`);
  console.log(chalk.cyan.bold("\n  WORKFLOW TEST COMPLETE\n"));
  console.log(`    Source:       ${source}`);
  console.log(`    Provider:     ${provider} (${region})`);
  console.log(`    Services:     ${recommendations.length} inferred`);
  console.log(`    Agents:       ${result.agents.length} executed`);
  console.log(`    Artifacts:    ${workDir}/artifacts/`);
  console.log(`    Cost Est:     $${costs.totalMonthly.toFixed(2)}/month`);
  console.log(`    Result:       ${result.success ? chalk.green("SUCCESS") : chalk.red("FAILED")}`);
  console.log(`    Duration:     ${(result.totalDuration / 1000).toFixed(1)}s`);
  console.log();
}

main().catch(err => {
  console.error(chalk.red(`\nFatal error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
