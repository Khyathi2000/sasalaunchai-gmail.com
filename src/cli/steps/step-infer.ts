import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import type { ServiceRecommendation } from "../../types/cloud.js";
import { inferServices, buildDependencyOrder } from "../../inference/inference-engine.js";
import { refineRecommendations } from "../../inference/llm-refiner.js";
import { lastParsedCodebase, lastAnalysisResult } from "./step-analyze.js";
import { statusPanel, serviceTable, success, error, info, dim, divider, costBar } from "../screen.js";
import { confirm } from "../prompts.js";
import { createSpinner } from "../spinner.js";
import { estimateCosts } from "../../monitoring/collectors/cost.js";
import chalk from "chalk";

export let lastRecommendations: ServiceRecommendation[] = [];

export async function stepInfer(plan: DeploymentPlan): Promise<StepResult> {
  if (!lastParsedCodebase) {
    error("No codebase data. Run analysis first.");
    return StepResult.Retry;
  }

  const provider = plan.provider || "aws";

  // Rule-based inference
  const spinner = createSpinner("Inferring cloud services...").start();
  let recommendations = inferServices(lastParsedCodebase, lastAnalysisResult, provider);
  spinner.succeed(`Inferred ${recommendations.length} services`);

  // LLM refinement
  if (process.env.ANTHROPIC_API_KEY) {
    const refineSpinner = createSpinner("Refining with Claude...").start();
    try {
      recommendations = await refineRecommendations(recommendations, lastParsedCodebase, lastAnalysisResult);
      refineSpinner.succeed("Recommendations refined");
    } catch {
      refineSpinner.warn("LLM refinement failed — using rule-based results");
    }
  }

  // Display service table
  console.log();
  const confColor = (c: string) => c === "high" ? chalk.green : c === "medium" ? chalk.yellow : chalk.red;
  serviceTable(
    ["Service", "Category", "Confidence", "Reason"],
    recommendations.map(r => ({
      cells: [r.serviceName, r.category, r.confidence, r.reason.slice(0, 35) + (r.reason.length > 35 ? "..." : "")],
      color: confColor(r.confidence),
    }))
  );

  // Dependency order
  console.log();
  const tiers = buildDependencyOrder(recommendations);
  info("Deployment Order:");
  for (let i = 0; i < tiers.length; i++) {
    const names = tiers[i].map(id => recommendations.find(r => r.serviceId === id)?.serviceName || id);
    const parallel = names.length > 1 ? chalk.gray(" (parallel)") : "";
    dim(`Tier ${i + 1}: ${names.join(" + ")}${parallel}`);
  }

  // Cost estimate
  const costs = estimateCosts(recommendations.map(r => r.serviceId));
  console.log();
  statusPanel("Cost Estimate", [
    { label: "Daily", value: `$${costs.totalDaily.toFixed(2)}`, color: chalk.yellow },
    { label: "Monthly", value: `$${costs.totalMonthly.toFixed(2)}`, color: chalk.yellow },
  ]);
  console.log();
  const maxCost = Math.max(...costs.byService.map(s => s.monthlyCost));
  for (const s of costs.byService.filter(s => s.dailyCost > 0).sort((a, b) => b.monthlyCost - a.monthlyCost)) {
    costBar(s.serviceId, s.monthlyCost, maxCost);
  }

  // Confirm
  console.log();
  const ok = await confirm(`Proceed with ${recommendations.length} services on ${provider.toUpperCase()}?`);
  if (!ok) return StepResult.Abort;

  plan.services = recommendations.map(r => ({ serviceId: r.serviceId, config: r.config }));
  lastRecommendations = recommendations;
  return StepResult.Continue;
}
