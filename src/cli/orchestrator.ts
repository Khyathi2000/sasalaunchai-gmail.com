import * as p from "@clack/prompts";
import chalk from "chalk";
import { StepResult, type DeploymentPlan } from "../types/plan.js";
import { showBanner, showStepHeader, showComplete, clearScreen } from "./screen.js";
import { log } from "../utils/logger.js";

export type StepFn = (plan: DeploymentPlan) => Promise<StepResult>;

interface Step {
  name: string;
  fn: StepFn;
}

export async function runWizard(steps: Step[], plan: DeploymentPlan): Promise<DeploymentPlan> {
  clearScreen();
  showBanner();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    showStepHeader(i + 1, steps.length, step.name);

    try {
      const result = await step.fn(plan);

      switch (result) {
        case StepResult.Continue:
          break;
        case StepResult.Retry:
          log.warn("Retrying step...");
          i--;
          break;
        case StepResult.Abort:
          console.log();
          console.log(chalk.yellow("  Deployment cancelled by user."));
          console.log();
          return plan;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ Step "${step.name}" failed: ${msg}`));
      console.log();

      const retry = await p.confirm({ message: "Retry this step?" });
      if (p.isCancel(retry) || !retry) {
        console.log(chalk.red("  Deployment aborted."));
        return plan;
      }
      i--;
    }
  }

  showComplete();
  return plan;
}
