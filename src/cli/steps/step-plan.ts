import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { lastRecommendations } from "./step-infer.js";
import { estimateCosts } from "../../monitoring/collectors/cost.js";
import { statusPanel, serviceTable, divider } from "../screen.js";
import { confirm } from "../prompts.js";
import chalk from "chalk";

export async function stepPlan(plan: DeploymentPlan): Promise<StepResult> {
  statusPanel("Deployment Plan", [
    { label: "Source", value: plan.source },
    { label: "Provider", value: `${plan.provider.toUpperCase()} (${plan.region})`, color: chalk.cyan },
    { label: "Mode", value: plan.applyMode ? "Auto-execute (terraform apply)" : "Generate artifacts only", color: plan.applyMode ? chalk.yellow : chalk.green },
    { label: "Services", value: `${lastRecommendations.length} selected` },
    { label: "Output", value: `${plan.workDir}/artifacts/` },
  ]);

  if (lastRecommendations.length > 0) {
    console.log();
    serviceTable(
      ["Service", "Category", "Confidence"],
      lastRecommendations.map(r => ({
        cells: [r.serviceName, r.category, r.confidence],
      }))
    );

    const costs = estimateCosts(lastRecommendations.map(r => r.serviceId));
    console.log();
    statusPanel("Estimated Cost", [
      { label: "Daily", value: `$${costs.totalDaily.toFixed(2)}`, color: chalk.yellow },
      { label: "Monthly", value: `$${costs.totalMonthly.toFixed(2)}`, color: chalk.yellow },
    ]);
  }

  console.log();
  const ok = await confirm("Proceed with deployment?");
  return ok ? StepResult.Continue : StepResult.Abort;
}
