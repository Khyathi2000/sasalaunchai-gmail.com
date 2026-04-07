#!/usr/bin/env tsx
/**
 * Full end-to-end test with real Claude API calls.
 * Tests against the Sakura AI codebase (rich Next.js app).
 */
import { resolve } from "path";
import { mkdirSync, existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
dotenv.config();

import { runParserAgent } from "./src/analysis/parser-agent.js";
import { runAnalyzerAgent } from "./src/analysis/analyzer-agent.js";
import { inferServices, buildDependencyOrder } from "./src/inference/inference-engine.js";
import { refineRecommendations } from "./src/inference/llm-refiner.js";
import { DeploymentOrchestrator } from "./src/agents/deployment-orchestrator.js";
import { estimateCosts } from "./src/monitoring/collectors/cost.js";
import { detectAnomalies } from "./src/monitoring/anomaly-detector.js";
import { collectMetrics } from "./src/monitoring/collectors/metrics.js";
import { scanForSecurityIssues } from "./src/analysis/security-scanner.js";
import type { DeploymentPlan } from "./src/types/plan.js";
import chalk from "chalk";

const LINE = chalk.gray("═".repeat(64));
const line = chalk.gray("─".repeat(64));

function section(num: number, total: number, title: string) {
  console.log(`\n${line}`);
  console.log(chalk.cyan.bold(`  [${num}/${total}] ${title}`));
  console.log(line);
}

async function main() {
  const source = resolve("C:/Users/saipr/OneDrive/Desktop/Sakura AI/sakuraAI");
  const workDir = resolve("./.launch-e2e");
  mkdirSync(workDir, { recursive: true });

  const startTime = Date.now();
  const TOTAL_STEPS = 9;

  console.log(`\n${LINE}`);
  console.log(chalk.cyan.bold("  LAUNCH PLATFORM — END-TO-END TEST"));
  console.log(chalk.gray(`  Target: Sakura AI (Next.js + Prisma + Claude + Stripe)`));
  console.log(chalk.gray(`  Mode:   Artifact generation (no cloud resources created)`));
  console.log(LINE);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Parse codebase
  // ═══════════════════════════════════════════════════════════════════
  section(1, TOTAL_STEPS, "CODEBASE PARSING");

  const codebase = await runParserAgent(source, (msg, count) => {
    process.stdout.write(chalk.gray(`\r    ${msg.slice(0, 70).padEnd(70)}`));
  });
  console.log(); // clear the \r line

  console.log(chalk.green("  ✓ Parse complete"));
  console.log(`    Repository:  ${codebase.repoName}`);
  console.log(`    Total files: ${codebase.totalFiles}`);
  console.log(`    Parsed:      ${codebase.files.length} files`);
  console.log(`    Tech stack:  ${codebase.techStack.join(", ")}`);

  // Show file breakdown by language
  const langCount = new Map<string, number>();
  for (const f of codebase.files) {
    langCount.set(f.language, (langCount.get(f.language) || 0) + 1);
  }
  console.log(`    Languages:   ${[...langCount.entries()].map(([l, c]) => `${l}(${c})`).join(", ")}`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Security scan
  // ═══════════════════════════════════════════════════════════════════
  section(2, TOTAL_STEPS, "SECURITY SCAN");

  const fileMap = new Map(codebase.files.map(f => [f.path, f.content]));
  const securityIssues = scanForSecurityIssues(fileMap);

  if (securityIssues.length > 0) {
    for (const issue of securityIssues.slice(0, 5)) {
      const icon = issue.severity === "critical" ? chalk.red("✗") : issue.severity === "high" ? chalk.yellow("⚠") : chalk.gray("○");
      console.log(`    ${icon} [${issue.severity.toUpperCase()}] ${issue.title} in ${issue.file}:${issue.line || "?"}`);
    }
    if (securityIssues.length > 5) console.log(chalk.gray(`    ... and ${securityIssues.length - 5} more`));
  } else {
    console.log(chalk.green("    ✓ No security issues found"));
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Claude deep analysis (REAL API CALL)
  // ═══════════════════════════════════════════════════════════════════
  section(3, TOTAL_STEPS, "AI-POWERED DEEP ANALYSIS (Claude API)");

  let analysisResult;
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.yellow("    Calling Claude API — this may take 30-60 seconds..."));
    let chunkCount = 0;

    try {
      analysisResult = await runAnalyzerAgent(codebase, (chunk) => {
        chunkCount++;
        if (chunkCount % 20 === 0) {
          process.stdout.write(chalk.gray(`\r    Streaming... ${chunkCount} chunks received`));
        }
      });
      console.log(); // clear \r line

      console.log(chalk.green("  ✓ Analysis complete"));
      console.log(`    Summary:     ${analysisResult.summary.slice(0, 120)}...`);
      console.log(`    Files:       ${analysisResult.fileExplanations.length} analyzed`);
      console.log(`    Tech items:  ${analysisResult.techConsiderations.length}`);
      console.log(`    Flowchart:   ${analysisResult.flowchart ? "Generated (" + analysisResult.flowchart.split("\n").length + " lines)" : "None"}`);

      // Show infrastructure requirements (the [INFRA] section)
      if (analysisResult.infraRequirements) {
        const infra = analysisResult.infraRequirements;
        console.log();
        console.log(chalk.white.bold("    Infrastructure Requirements (from Claude):"));
        console.log(`    Runtime:     ${infra.runtime?.type} — ${infra.runtime?.reason?.slice(0, 60)}`);
        if (infra.databases?.length > 0) {
          console.log(`    Databases:   ${infra.databases.map(d => `${d.engine}(${d.type})`).join(", ")}`);
        }
        if (infra.storage?.length > 0) {
          console.log(`    Storage:     ${infra.storage.map(s => s.type).join(", ")}`);
        }
        if (infra.networking) {
          console.log(`    Networking:  LB=${infra.networking.needsLoadBalancer} CDN=${infra.networking.needsCDN}`);
        }
        if (infra.auth?.type !== "none") {
          console.log(`    Auth:        ${infra.auth?.type} via ${infra.auth?.provider}`);
        }
        if (infra.envVars?.length > 0) {
          console.log(`    Env vars:    ${infra.envVars.length} detected (${infra.envVars.filter(v => v.sensitive).length} sensitive)`);
        }
      } else {
        console.log(chalk.yellow("    Note: Claude did not return structured infra requirements"));
      }
    } catch (err) {
      console.log();
      console.log(chalk.red(`  ✗ Claude analysis failed: ${err instanceof Error ? err.message : err}`));
      console.log(chalk.yellow("    Continuing with rule-based inference only..."));
    }
  } else {
    console.log(chalk.yellow("    Skipped (no ANTHROPIC_API_KEY)"));
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Service inference (rules + LLM refinement)
  // ═══════════════════════════════════════════════════════════════════
  section(4, TOTAL_STEPS, "SERVICE INFERENCE");

  const provider = "aws";
  const region = "us-east-1";

  let recommendations = inferServices(codebase, analysisResult, provider);
  console.log(chalk.green(`  ✓ Rule-based: ${recommendations.length} services inferred`));

  // LLM refinement
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(chalk.yellow("    Refining with Claude..."));
    try {
      recommendations = await refineRecommendations(recommendations, codebase, analysisResult);
      console.log(chalk.green(`  ✓ LLM-refined: ${recommendations.length} services`));
    } catch (err) {
      console.log(chalk.yellow(`    LLM refinement failed: ${err instanceof Error ? err.message : err}`));
    }
  }

  // Display as table
  console.log();
  const hdr = `    ${"Service".padEnd(22)} ${"Category".padEnd(18)} ${"Confidence".padEnd(12)} Reason`;
  console.log(hdr);
  console.log(chalk.gray(`    ${"─".repeat(80)}`));
  for (const r of recommendations) {
    const confColor = r.confidence === "high" ? chalk.green : r.confidence === "medium" ? chalk.yellow : chalk.red;
    console.log(`    ${r.serviceName.padEnd(22)} ${r.category.padEnd(18)} ${confColor(r.confidence.padEnd(12))} ${r.reason.slice(0, 40)}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Dependency graph
  // ═══════════════════════════════════════════════════════════════════
  section(5, TOTAL_STEPS, "DEPENDENCY GRAPH & EXECUTION ORDER");

  const tiers = buildDependencyOrder(recommendations);
  for (let i = 0; i < tiers.length; i++) {
    const tierNames = tiers[i].map(id => {
      const rec = recommendations.find(r => r.serviceId === id);
      return rec?.serviceName || id;
    });
    const parallel = tierNames.length > 1 ? chalk.gray(" (parallel)") : "";
    console.log(`    Tier ${i + 1}: ${tierNames.join(" + ")}${parallel}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: Cost estimation
  // ═══════════════════════════════════════════════════════════════════
  section(6, TOTAL_STEPS, "COST ESTIMATION");

  const costs = estimateCosts(recommendations.map(r => r.serviceId));
  console.log(`    Daily total:   ${chalk.yellow("$" + costs.totalDaily.toFixed(2))}`);
  console.log(`    Monthly total: ${chalk.yellow("$" + costs.totalMonthly.toFixed(2))}`);
  console.log();
  for (const s of costs.byService.filter(s => s.dailyCost > 0).sort((a, b) => b.monthlyCost - a.monthlyCost)) {
    const bar = "█".repeat(Math.round(s.monthlyCost / costs.totalMonthly * 20));
    console.log(`    ${s.serviceId.padEnd(18)} $${s.monthlyCost.toFixed(2).padStart(6)}/mo  ${chalk.cyan(bar)}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: Deploy agents (artifact generation)
  // ═══════════════════════════════════════════════════════════════════
  section(7, TOTAL_STEPS, "MULTI-AGENT DEPLOYMENT (Artifact Generation)");

  const plan: DeploymentPlan = {
    source: source,
    provider,
    region,
    services: recommendations.map(r => ({ serviceId: r.serviceId, config: r.config })),
    workDir,
    applyMode: false,
  };

  const orchestrator = new DeploymentOrchestrator(plan, recommendations);
  const bus = orchestrator.getBus();

  // Track agent events
  bus.on("message", (msg: { from: string; type: string; payload: { status?: string; message?: string } }) => {
    if (msg.type === "status") {
      const colors: Record<string, (s: string) => string> = {
        provisioning: chalk.yellow, configuring: chalk.blue,
        validating: chalk.cyan, done: chalk.green, error: chalk.red,
      };
      const color = colors[msg.payload.status || ""] || chalk.white;
      console.log(`    ${color("●")} ${msg.from.padEnd(22)} ${color(String(msg.payload.status || "").padEnd(14))} ${msg.payload.message || ""}`);
    }
  });

  const result = await orchestrator.execute();

  console.log();
  if (result.success) {
    console.log(chalk.green(`  ✓ All ${result.agents.length} agents completed in ${(result.totalDuration / 1000).toFixed(1)}s`));
  } else {
    console.log(chalk.red(`  ✗ Failed: ${result.error}`));
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: Verify generated artifacts
  // ═══════════════════════════════════════════════════════════════════
  section(8, TOTAL_STEPS, "GENERATED ARTIFACTS");

  const tfDir = join(workDir, "artifacts", "terraform", "aws");
  let totalTfLines = 0;

  if (existsSync(tfDir)) {
    const modules = readdirSync(tfDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const mod of modules) {
      const files = readdirSync(join(tfDir, mod.name));
      let lines = 0;
      for (const f of files) {
        lines += readFileSync(join(tfDir, mod.name, f), "utf-8").split("\n").length;
      }
      totalTfLines += lines;
      console.log(`    ${chalk.bold(mod.name.padEnd(18))} ${files.join(", ").padEnd(20)} ${lines} lines`);
    }
    console.log();
    console.log(`    Total: ${modules.length} Terraform modules, ${totalTfLines} lines of IaC`);
  }

  const scriptsDir = join(workDir, "artifacts", "scripts");
  if (existsSync(scriptsDir)) {
    const scripts = readdirSync(scriptsDir);
    console.log(`    Scripts: ${scripts.join(", ")}`);
  }

  // Show a sample terraform file
  const vpcTf = join(tfDir, "vpc", "main.tf");
  if (existsSync(vpcTf)) {
    console.log();
    console.log(chalk.white.bold("    Sample: vpc/main.tf (first 15 lines)"));
    const content = readFileSync(vpcTf, "utf-8").split("\n").slice(0, 15);
    for (const l of content) {
      console.log(chalk.gray(`    │ ${l}`));
    }
    console.log(chalk.gray(`    │ ... (${readFileSync(vpcTf, "utf-8").split("\n").length} total lines)`));
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 9: Monitoring simulation
  // ═══════════════════════════════════════════════════════════════════
  section(9, TOTAL_STEPS, "MONITORING & ANOMALY DETECTION");

  const serviceIds = recommendations.map(r => r.serviceId).slice(0, 4);
  for (const sid of serviceIds) {
    const metrics = await collectMetrics(sid, region);
    const alerts = detectAnomalies(metrics);
    const cpuBar = "█".repeat(Math.round((metrics.cpu || 0) / 5)) + "░".repeat(20 - Math.round((metrics.cpu || 0) / 5));
    const cpuColor = (metrics.cpu || 0) > 80 ? chalk.red : (metrics.cpu || 0) > 60 ? chalk.yellow : chalk.green;

    console.log(`    ${sid.padEnd(18)} CPU: ${cpuColor(cpuBar)} ${(metrics.cpu || 0).toFixed(1)}%  ${alerts.length > 0 ? chalk.red(`⚠ ${alerts.length} alert(s)`) : chalk.green("OK")}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  const totalDuration = Date.now() - startTime;

  console.log(`\n${LINE}`);
  console.log(chalk.cyan.bold("  END-TO-END TEST RESULTS"));
  console.log(LINE);
  console.log();
  console.log(`    Source:          ${codebase.repoName} (${codebase.totalFiles} files)`);
  console.log(`    Tech Stack:     ${codebase.techStack.slice(0, 8).join(", ")}`);
  console.log(`    Security:       ${securityIssues.length} issues found`);
  console.log(`    AI Analysis:    ${analysisResult ? chalk.green("✓ Complete") : chalk.yellow("Skipped")}`);
  console.log(`    Infra Reqs:     ${analysisResult?.infraRequirements ? chalk.green("✓ Extracted") : chalk.yellow("Rule-based only")}`);
  console.log(`    Services:       ${recommendations.length} inferred for ${provider.toUpperCase()}`);
  console.log(`    Agents:         ${result.agents.length} executed (${result.agents.filter(a => a.status === "done").length} succeeded)`);
  console.log(`    Terraform:      ${totalTfLines} lines across ${existsSync(tfDir) ? readdirSync(tfDir, { withFileTypes: true }).filter(d => d.isDirectory()).length : 0} modules`);
  console.log(`    Est. Cost:      $${costs.totalMonthly.toFixed(2)}/month`);
  console.log(`    Artifacts:      ${workDir}/artifacts/`);
  console.log(`    Total Time:     ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`    Result:         ${result.success ? chalk.green.bold("✓ SUCCESS") : chalk.red.bold("✗ FAILED")}`);
  console.log();
}

main().catch(err => {
  console.error(chalk.red(`\nFatal error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
