import * as p from "@clack/prompts";
import chalk from "chalk";
import { StepResult, type DeploymentPlan } from "../types/plan.js";
import { header } from "./renderer.js";
import { log } from "../utils/logger.js";

export type StepFn = (plan: DeploymentPlan) => Promise<StepResult>;

interface Step {
  name: string;
  fn: StepFn;
}

export async function runWizard(steps: Step[], plan: DeploymentPlan): Promise<DeploymentPlan> {
  p.intro(chalk.cyan.bold("launch-platform"));

  header("Cloud Deployment Wizard");
  log.info(`Working directory: ${plan.workDir}`);
  console.log();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNum = `[${i + 1}/${steps.length}]`;

    p.log.step(`${stepNum} ${chalk.bold(step.name)}`);

    try {
      const result = await step.fn(plan);

      switch (result) {
        case StepResult.Continue:
          break;
        case StepResult.Retry:
          log.warn("Retrying step...");
          i--; // Re-run this step
          break;
        case StepResult.Abort:
          log.warn("Wizard aborted.");
          p.outro(chalk.yellow("Deployment cancelled."));
          return plan;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Step "${step.name}" failed: ${msg}`);
      p.log.error(msg);

      const retry = await p.confirm({ message: "Retry this step?" });
      if (p.isCancel(retry) || !retry) {
        p.outro(chalk.red("Deployment aborted due to error."));
        return plan;
      }
      i--; // Retry
    }
  }

  p.outro(chalk.green("Wizard complete!"));
  return plan;
}
