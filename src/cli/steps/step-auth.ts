import type { DeploymentPlan } from "../../types/plan.js";
import { StepResult } from "../../types/plan.js";
import { AWSProvider } from "../../providers/aws/credentials.js";
import { GCPProvider } from "../../providers/gcp/credentials.js";
import { log } from "../../utils/logger.js";
import { createSpinner } from "../spinner.js";
import { textInput, confirm } from "../prompts.js";
import { header, subheader, keyValue, warn } from "../renderer.js";

export async function stepAuth(plan: DeploymentPlan): Promise<StepResult> {
  if (plan.provider === "gcp") {
    return stepAuthGCP(plan);
  }
  return stepAuthAWS(plan);
}

async function stepAuthAWS(plan: DeploymentPlan): Promise<StepResult> {
  const spinner = createSpinner("Validating AWS credentials...").start();

  const provider = new AWSProvider();
  const result = await provider.validateCredentials();

  if (result.valid) {
    spinner.succeed(`AWS credentials valid: ${result.identity}`);
  } else {
    spinner.warn(`AWS: ${result.error}`);
    if (plan.applyMode) {
      log.error("Valid AWS credentials required for --apply mode");
      return StepResult.Retry;
    }
    log.info("Continuing in artifact-only mode (no credentials needed)");
  }

  return StepResult.Continue;
}

async function stepAuthGCP(plan: DeploymentPlan): Promise<StepResult> {
  header("GCP Authentication");

  const gcp = new GCPProvider();

  // Check if gcloud is installed
  if (!gcp.isGcloudInstalled()) {
    warn("gcloud CLI is not installed.");
    log.error("Install from: https://cloud.google.com/sdk/docs/install");
    log.info("After installing, restart your terminal and re-run.");
    return plan.applyMode ? StepResult.Retry : StepResult.Continue;
  }
  log.success("gcloud CLI detected");

  // Check existing auth
  const existingAccount = gcp.getCurrentAccount();
  const existingProject = gcp.getCurrentProject();

  if (existingAccount && existingProject) {
    subheader("Existing GCP Session");
    keyValue("Account", existingAccount);
    keyValue("Project", existingProject);

    const useExisting = await confirm("Use this existing GCP session?");
    if (useExisting) {
      const spinner = createSpinner("Validating access...").start();
      const result = await gcp.validateCredentials();
      if (result.valid) {
        spinner.succeed(`Authenticated: ${result.identity}`);
        plan.gcpCredentials = {
          projectId: existingProject,
          email: existingAccount,
          authenticated: true,
        };
        return StepResult.Continue;
      }
      spinner.fail(`Validation failed: ${result.error}`);
    }
  }

  // Interactive login flow
  subheader("GCP Login");

  // Get project ID
  const projectId = await textInput(
    "Enter your GCP Project ID",
    "my-project-123"
  );

  // Get email
  const email = await textInput(
    "Enter your GCP account email",
    "you@example.com"
  );

  // Set the project
  log.step(`Setting project to ${projectId}...`);
  const projectResult = gcp.setProject(projectId);
  if (!projectResult.success) {
    log.error(`Failed to set project: ${projectResult.error}`);
    return StepResult.Retry;
  }
  log.success(`Project set: ${projectId}`);

  // Run gcloud auth login
  console.log();
  log.step("Opening browser for GCP authentication...");
  log.info("A browser window will open. Sign in with your Google account.");
  log.info("If no browser opens, follow the URL shown below.");
  console.log();

  const loginResult = gcp.login(email);

  if (!loginResult.success) {
    log.error(`Login failed: ${loginResult.error}`);
    const retry = await confirm("Try again?");
    return retry ? StepResult.Retry : StepResult.Abort;
  }

  log.success(`Logged in as: ${loginResult.account}`);

  // Validate access to the project
  const spinner = createSpinner("Validating project access...").start();
  const validation = await gcp.validateCredentials();

  if (validation.valid) {
    spinner.succeed(`Authenticated: ${validation.identity}`);

    plan.gcpCredentials = {
      projectId,
      email,
      authenticated: true,
    };

    // Ask if they want application-default credentials (for SDK usage)
    const setupADC = await confirm("Set up Application Default Credentials? (recommended for SDK tools)");
    if (setupADC) {
      log.step("Setting up Application Default Credentials...");
      const adcResult = gcp.setupApplicationDefaultCredentials();
      if (adcResult.success) {
        log.success("ADC configured — SDKs will use your credentials automatically");
      } else {
        warn(`ADC setup failed: ${adcResult.error} (non-blocking)`);
      }
    }
  } else {
    spinner.fail(`Validation failed: ${validation.error}`);
    if (plan.applyMode) {
      return StepResult.Retry;
    }
    log.info("Continuing in artifact-only mode");
  }

  return StepResult.Continue;
}
