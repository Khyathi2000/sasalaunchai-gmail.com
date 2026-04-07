import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { startMonitoring } from "../../monitoring/monitor.js";
import { confirm } from "../prompts.js";
import { log } from "../../utils/logger.js";

export async function stepMonitor(plan: DeploymentPlan): Promise<StepResult> {
  if (!plan.applyMode) {
    log.info("Monitoring available in --apply mode only.");
    log.info("After deploying, re-run with: launch --source <path> --apply");
    return StepResult.Continue;
  }

  const startMon = await confirm("Enter monitoring mode?");
  if (!startMon) return StepResult.Continue;

  const serviceIds = plan.services.map(s => s.serviceId);

  await startMonitoring(plan, {
    intervalMs: 30_000,
    endpoints: [], // Would be populated from deployment outputs
    serviceIds,
    region: plan.region,
  });

  return StepResult.Continue;
}
