import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { lastRecommendations } from "./step-infer.js";
import { estimateCosts } from "../../monitoring/collectors/cost.js";
import { header, subheader, table, keyValue, box } from "../renderer.js";
import { confirm } from "../prompts.js";

export async function stepPlan(plan: DeploymentPlan): Promise<StepResult> {
  header("Deployment Plan");

  keyValue("Source", plan.source);
  keyValue("Provider", plan.provider);
  keyValue("Region", plan.region);
  keyValue("Mode", plan.applyMode ? "Auto-execute (terraform apply)" : "Generate artifacts only");
  keyValue("Services", String(lastRecommendations.length));
  keyValue("Output", `${plan.workDir}/artifacts/`);

  if (lastRecommendations.length > 0) {
    subheader("Services to Deploy");
    const rows = lastRecommendations.map(r => [
      r.serviceName,
      r.category,
      r.confidence,
    ]);
    table(["Service", "Category", "Confidence"], rows);

    // Cost estimate
    const costs = estimateCosts(lastRecommendations.map(r => r.serviceId));
    console.log();
    subheader("Estimated Cost");
    keyValue("Daily", `$${costs.totalDaily.toFixed(2)}`);
    keyValue("Monthly", `$${costs.totalMonthly.toFixed(2)}`);
  }

  console.log();
  const ok = await confirm("Proceed with deployment?");
  return ok ? StepResult.Continue : StepResult.Abort;
}
