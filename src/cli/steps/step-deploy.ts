import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { lastRecommendations } from "./step-infer.js";
import { executeDeployment } from "../../execution/executor.js";
import { statusPanel, agentStatusLine, success, error as showError, info, panel, divider } from "../screen.js";
import chalk from "chalk";

export async function stepDeploy(plan: DeploymentPlan): Promise<StepResult> {
  if (lastRecommendations.length === 0) {
    showError("No services selected. Run inference first.");
    return StepResult.Retry;
  }

  info(`Mode: ${plan.applyMode ? "Auto-execute (terraform apply)" : "Artifact generation"}`);
  info(`Services: ${lastRecommendations.length}`);
  info(`Output: ${plan.workDir}/artifacts/`);
  console.log();

  try {
    const result = await executeDeployment(plan, lastRecommendations);

    // Agent results
    console.log();
    for (const a of result.agents) {
      const duration = a.startedAt && a.completedAt
        ? new Date(a.completedAt).getTime() - new Date(a.startedAt).getTime()
        : undefined;
      agentStatusLine(
        a.agentId.replace("-agent", ""),
        a.status,
        a.error || Object.keys(a.outputs).join(", "),
        duration
      );
    }

    console.log();
    if (result.success) {
      success(`All agents completed in ${(result.totalDuration / 1000).toFixed(1)}s`);
      console.log();
      statusPanel("Artifacts", [
        { label: "Directory", value: `${plan.workDir}/artifacts/` },
        { label: "Summary", value: `${plan.workDir}/artifacts/summary.json` },
      ]);

      if (!plan.applyMode) {
        console.log();
        info("To apply: re-run with --apply flag");
        info("Or: bash .launch/artifacts/scripts/deploy.sh");
      }
    } else {
      showError(`Deployment failed: ${result.error}`);
      return StepResult.Abort;
    }
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
    return StepResult.Abort;
  }

  return StepResult.Continue;
}
