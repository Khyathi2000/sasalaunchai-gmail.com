import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { selectProvider, selectRegion } from "../prompts.js";
import { log } from "../../utils/logger.js";

export async function stepProvider(plan: DeploymentPlan): Promise<StepResult> {
  if (!plan.provider) {
    plan.provider = await selectProvider();
  }
  if (!plan.region) {
    plan.region = await selectRegion(plan.provider);
  }

  log.success(`Provider: ${plan.provider} (${plan.region})`);
  return StepResult.Continue;
}
