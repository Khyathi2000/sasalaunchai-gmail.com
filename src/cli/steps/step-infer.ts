import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import type { ServiceRecommendation } from "../../types/cloud.js";
import { inferServices, buildDependencyOrder } from "../../inference/inference-engine.js";
import { refineRecommendations } from "../../inference/llm-refiner.js";
import { lastParsedCodebase, lastAnalysisResult } from "./step-analyze.js";
import { header, table, subheader, keyValue } from "../renderer.js";
import { confirm } from "../prompts.js";
import { log } from "../../utils/logger.js";
import { createSpinner } from "../spinner.js";

export let lastRecommendations: ServiceRecommendation[] = [];

export async function stepInfer(plan: DeploymentPlan): Promise<StepResult> {
  if (!lastParsedCodebase) {
    log.error("No codebase data available. Run analysis first.");
    return StepResult.Retry;
  }

  header("Service Inference");

  // Use selected provider or default to aws
  const provider = plan.provider || "aws";

  // Layer 1+2: Rule-based + analysis-enhanced inference
  const spinner = createSpinner("Inferring cloud services...").start();
  let recommendations = inferServices(lastParsedCodebase, lastAnalysisResult, provider);
  spinner.succeed(`Inferred ${recommendations.length} services`);

  // Layer 3: LLM refinement
  if (process.env.ANTHROPIC_API_KEY) {
    const refineSpinner = createSpinner("Refining with Claude...").start();
    try {
      recommendations = await refineRecommendations(recommendations, lastParsedCodebase, lastAnalysisResult);
      refineSpinner.succeed("Recommendations refined");
    } catch {
      refineSpinner.fail("LLM refinement failed, using rule-based results");
    }
  }

  // Display recommendations
  subheader("Recommended Services");
  const rows = recommendations.map(r => [
    r.serviceName,
    r.category,
    r.confidence,
    r.reason.slice(0, 50) + (r.reason.length > 50 ? "..." : ""),
  ]);
  table(["Service", "Category", "Confidence", "Reason"], rows);
  console.log();

  // Show dependency order
  const tiers = buildDependencyOrder(recommendations);
  subheader("Deployment Order");
  tiers.forEach((tier, i) => {
    keyValue(`Tier ${i + 1}`, tier.join(", "));
  });
  console.log();

  // Confirm
  const ok = await confirm(`Proceed with ${recommendations.length} services?`);
  if (!ok) return StepResult.Abort;

  // Store in plan
  plan.services = recommendations.map(r => ({
    serviceId: r.serviceId,
    config: r.config,
  }));
  lastRecommendations = recommendations;

  return StepResult.Continue;
}
