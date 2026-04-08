import { existsSync, statSync } from "fs";
import { resolve } from "path";
import * as p from "@clack/prompts";
import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { statusPanel, success, info } from "../screen.js";
import chalk from "chalk";

export async function stepSource(plan: DeploymentPlan): Promise<StepResult> {
  // Always ask for source interactively
  info("Provide your project codebase to analyze and deploy.");
  console.log();

  const sourceInput = await p.text({
    message: "Enter path to codebase or GitHub URL",
    placeholder: plan.source || "./my-app or https://github.com/owner/repo",
    initialValue: plan.source || "",
    validate: (val) => {
      if (!val.trim()) return "Please enter a path or URL";
    },
  });

  if (p.isCancel(sourceInput)) process.exit(0);
  plan.source = (sourceInput as string).trim();

  // Validate source
  const isGithub = plan.source.startsWith("http") && plan.source.includes("github.com");

  if (isGithub) {
    console.log();
    statusPanel("Source", [
      { label: "Type", value: "GitHub Repository", color: chalk.cyan },
      { label: "URL", value: plan.source },
    ]);
  } else {
    const resolved = resolve(plan.source);
    if (!existsSync(resolved)) {
      console.log(chalk.red(`  ✗ Path not found: ${resolved}`));
      plan.source = "";
      return StepResult.Retry;
    }
    if (!statSync(resolved).isDirectory()) {
      console.log(chalk.red(`  ✗ Not a directory: ${resolved}`));
      plan.source = "";
      return StepResult.Retry;
    }
    plan.source = resolved.replace(/\\/g, "/");

    console.log();
    statusPanel("Source", [
      { label: "Type", value: "Local Directory", color: chalk.green },
      { label: "Path", value: plan.source },
    ]);
  }

  console.log();
  success("Source validated. Starting analysis...");
  return StepResult.Continue;
}
