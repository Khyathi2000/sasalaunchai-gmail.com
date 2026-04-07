import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { AWSProvider } from "../../providers/aws/credentials.js";
import { GCPProvider } from "../../providers/gcp/credentials.js";
import { log } from "../../utils/logger.js";
import { createSpinner } from "../spinner.js";

export async function stepAuth(plan: DeploymentPlan): Promise<StepResult> {
  const spinner = createSpinner("Validating credentials...").start();

  const provider = plan.provider === "gcp" ? new GCPProvider() : new AWSProvider();
  const result = await provider.validateCredentials();

  if (result.valid) {
    spinner.succeed(`Credentials valid: ${result.identity}`);
  } else {
    spinner.warn(`Credentials: ${result.error}`);
    if (plan.applyMode) {
      log.error("Valid credentials required for --apply mode");
      return StepResult.Retry;
    }
    log.info("Continuing in artifact-only mode (no credentials needed)");
  }

  return StepResult.Continue;
}
