import { execSync } from "child_process";
import { existsSync } from "fs";
import { log } from "../utils/logger.js";

export interface TfResult {
  success: boolean;
  output: string;
  exitCode: number;
}

function runTf(command: string, workDir: string, timeout: number = 300_000): TfResult {
  try {
    const output = execSync(`terraform ${command}`, {
      cwd: workDir,
      timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; status?: number };
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    return { success: false, output, exitCode: err.status ?? 1 };
  }
}

export function terraformInit(workDir: string): TfResult {
  log.debug(`terraform init in ${workDir}`);
  return runTf("init -input=false", workDir);
}

export function terraformPlan(workDir: string): TfResult {
  log.debug(`terraform plan in ${workDir}`);
  return runTf("plan -input=false -no-color", workDir);
}

export function terraformApply(workDir: string): TfResult {
  log.debug(`terraform apply in ${workDir}`);
  return runTf("apply -auto-approve -input=false -no-color", workDir, 600_000);
}

export function terraformDestroy(workDir: string): TfResult {
  log.debug(`terraform destroy in ${workDir}`);
  return runTf("destroy -auto-approve -input=false -no-color", workDir, 600_000);
}

export function terraformOutput(workDir: string): Record<string, unknown> {
  const result = runTf("output -json", workDir);
  if (!result.success) return {};
  try {
    return JSON.parse(result.output);
  } catch {
    return {};
  }
}

export function isTerraformInstalled(): boolean {
  try {
    execSync("terraform version", { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
