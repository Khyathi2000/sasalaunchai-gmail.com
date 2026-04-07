import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { lastRecommendations } from "./step-infer.js";
import { executeDeployment } from "../../execution/executor.js";
import { header, subheader, table, success, error as renderError, keyValue, agentStatus } from "../renderer.js";
import { log } from "../../utils/logger.js";

export async function stepDeploy(plan: DeploymentPlan): Promise<StepResult> {
  if (lastRecommendations.length === 0) {
    log.error("No services selected. Run inference first.");
    return StepResult.Retry;
  }

  header(plan.applyMode ? "Deploying Infrastructure" : "Generating Artifacts");

  log.info(`Mode: ${plan.applyMode ? "Auto-execute (terraform apply)" : "Artifact generation"}`);
  log.info(`Services: ${lastRecommendations.length}`);
  log.info(`Output: ${plan.workDir}/artifacts/`);
  console.log();

  try {
    const result = await executeDeployment(plan, lastRecommendations);

    subheader("Agent Results");
    const rows = result.agents.map(a => [
      a.agentId.replace("-agent", ""),
      a.status,
      a.error || "OK",
      `${a.startedAt ? Math.round((new Date(a.completedAt || "").getTime() - new Date(a.startedAt).getTime()) / 1000) : 0}s`,
    ]);
    table(["Agent", "Status", "Result", "Duration"], rows);
    console.log();

    if (result.success) {
      success(`Deployment complete in ${Math.round(result.totalDuration / 1000)}s`);
      keyValue("Artifacts", `${plan.workDir}/artifacts/`);
      keyValue("Summary", `${plan.workDir}/artifacts/summary.json`);

      if (!plan.applyMode) {
        console.log();
        log.info("To apply these artifacts, run with --apply flag");
        log.info("Or execute: bash .launch/artifacts/scripts/deploy.sh");
      }
    } else {
      renderError(`Deployment failed: ${result.error}`);
      return StepResult.Abort;
    }
  } catch (err) {
    renderError(err instanceof Error ? err.message : String(err));
    return StepResult.Abort;
  }

  console.log();
  return StepResult.Continue;
}
