#!/usr/bin/env tsx
import { Command } from "commander";
import dotenv from "dotenv";
import { resolve } from "path";
import { runWizard } from "../src/cli/orchestrator.js";
import { type DeploymentPlan } from "../src/types/plan.js";
import { setLogLevel } from "../src/utils/logger.js";

// Import all step implementations
import { stepSource } from "../src/cli/steps/step-source.js";
import { stepAnalyze } from "../src/cli/steps/step-analyze.js";
import { stepInfer } from "../src/cli/steps/step-infer.js";
import { stepProvider } from "../src/cli/steps/step-provider.js";
import { stepAuth } from "../src/cli/steps/step-auth.js";
import { stepPlan } from "../src/cli/steps/step-plan.js";
import { stepDeploy } from "../src/cli/steps/step-deploy.js";
import { stepValidate } from "../src/cli/steps/step-validate.js";
import { stepMonitor } from "../src/cli/steps/step-monitor.js";

dotenv.config();

const program = new Command();

program
  .name("launch")
  .description("Multi-agent cloud deployment platform — analyze, infer, deploy, monitor")
  .version("0.1.0")
  .option("-s, --source <path>", "Path to codebase or GitHub URL")
  .option("-w, --workdir <path>", "Working directory for generated files", "./.launch")
  .option("-p, --provider <provider>", "Cloud provider (aws|gcp)")
  .option("-r, --region <region>", "Cloud region")
  .option("--apply", "Auto-execute deployment (default: generate artifacts only)", false)
  .option("-v, --verbose", "Enable verbose logging", false)
  .action(async (opts) => {
    if (opts.verbose) setLogLevel("debug");

    const plan: DeploymentPlan = {
      source: opts.source || "",
      provider: opts.provider || "",
      region: opts.region || "",
      services: [],
      workDir: resolve(opts.workdir),
      applyMode: opts.apply || false,
    };

    const steps = [
      { name: "Codebase Source",     fn: stepSource },
      { name: "Code Analysis",       fn: stepAnalyze },
      { name: "Provider Selection",  fn: stepProvider },
      { name: "Service Inference",   fn: stepInfer },
      { name: "Credential Check",    fn: stepAuth },
      { name: "Deployment Plan",     fn: stepPlan },
      { name: "Deploy",              fn: stepDeploy },
      { name: "Validation",          fn: stepValidate },
      { name: "Monitoring",          fn: stepMonitor },
    ];

    await runWizard(steps, plan);
  });

program.parse();
