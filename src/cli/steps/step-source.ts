import { existsSync, statSync } from "fs";
import { resolve } from "path";
import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { textInput } from "../prompts.js";
import { log } from "../../utils/logger.js";

export async function stepSource(plan: DeploymentPlan): Promise<StepResult> {
  if (!plan.source) {
    plan.source = await textInput(
      "Enter path to codebase or GitHub URL",
      "./my-app or https://github.com/owner/repo"
    );
  }

  // Validate source
  const isGithub = plan.source.startsWith("http") && plan.source.includes("github.com");

  if (isGithub) {
    log.success(`GitHub repository: ${plan.source}`);
  } else {
    const resolved = resolve(plan.source);
    if (!existsSync(resolved)) {
      log.error(`Path not found: ${resolved}`);
      plan.source = "";
      return StepResult.Retry;
    }
    if (!statSync(resolved).isDirectory()) {
      log.error(`Not a directory: ${resolved}`);
      plan.source = "";
      return StepResult.Retry;
    }
    plan.source = resolved;
    log.success(`Local codebase: ${plan.source}`);
  }

  return StepResult.Continue;
}
