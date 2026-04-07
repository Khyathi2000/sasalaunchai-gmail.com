import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { header, success, warn, keyValue } from "../renderer.js";
import { log } from "../../utils/logger.js";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

export async function stepValidate(plan: DeploymentPlan): Promise<StepResult> {
  header("Post-Deployment Validation");

  // Check artifact directory exists
  const artifactDir = join(plan.workDir, "artifacts");
  if (!existsSync(artifactDir)) {
    warn("No artifacts found to validate");
    return StepResult.Continue;
  }

  // Count generated files
  let tfFileCount = 0;
  let scriptCount = 0;
  const tfDir = join(artifactDir, "terraform");
  const scriptDir = join(artifactDir, "scripts");

  if (existsSync(tfDir)) {
    const walkCount = (dir: string): number => {
      let count = 0;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) count += walkCount(join(dir, entry.name));
        else if (entry.name.endsWith(".tf")) count++;
      }
      return count;
    };
    tfFileCount = walkCount(tfDir);
  }
  if (existsSync(scriptDir)) {
    scriptCount = readdirSync(scriptDir).filter(f => f.endsWith(".sh")).length;
  }

  keyValue("Terraform files", String(tfFileCount));
  keyValue("Deploy scripts", String(scriptCount));

  // Check summary
  const summaryPath = join(artifactDir, "summary.json");
  if (existsSync(summaryPath)) {
    success("Deployment summary generated");
  }

  if (plan.applyMode) {
    log.info("In apply mode — cloud resources would be validated here");
    // Future: HTTP health checks, terraform output checks, etc.
  } else {
    success("Artifacts generated successfully");
    log.info("Review artifacts in .launch/artifacts/ before applying");
  }

  console.log();
  return StepResult.Continue;
}
