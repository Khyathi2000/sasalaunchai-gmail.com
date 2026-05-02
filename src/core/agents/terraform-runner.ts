// Streaming terraform runner — merges per-agent .tf files into a single
// stack, then runs init/apply with stdout/stderr piped to a MessageBus.

import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ServiceRecommendation } from "../types/cloud.js";
import type { DeploymentPlan } from "../types/plan.js";
import type { MessageBus } from "./message-bus.js";

export interface TfStreamResult {
  success: boolean;
  exitCode: number;
  outputs: Record<string, { value: unknown; type: unknown; sensitive?: boolean }>;
  rootDir: string;
  error?: string;
}

const TF_AGENT_ID = "terraform";

export async function applyDeployment(
  plan: DeploymentPlan,
  recommendations: ServiceRecommendation[],
  bus: MessageBus,
): Promise<TfStreamResult> {
  const rootDir = mergeStack(plan, recommendations, bus);

  bus.publishStatus(TF_AGENT_ID, "provisioning", "Running terraform init...");
  const init = await runTf(["init", "-input=false", "-no-color"], rootDir, bus);
  if (init.code !== 0) {
    bus.publishError(TF_AGENT_ID, `terraform init failed (exit ${init.code})`);
    return { success: false, exitCode: init.code, outputs: {}, rootDir, error: "terraform init failed" };
  }

  bus.publishStatus(TF_AGENT_ID, "deploying", "Running terraform apply...");
  const apply = await runTf(
    ["apply", "-auto-approve", "-input=false", "-no-color"],
    rootDir,
    bus,
  );
  if (apply.code !== 0) {
    bus.publishError(TF_AGENT_ID, `terraform apply failed (exit ${apply.code})`);
    return { success: false, exitCode: apply.code, outputs: {}, rootDir, error: "terraform apply failed" };
  }

  bus.publishStatus(TF_AGENT_ID, "validating", "Reading terraform outputs...");
  const out = await runTf(["output", "-json"], rootDir, bus, /*silent*/ true);
  let outputs: TfStreamResult["outputs"] = {};
  if (out.code === 0) {
    try {
      outputs = JSON.parse(out.stdout);
    } catch {
      // ignore parse errors
    }
  }
  publishOutputsToAgents(outputs, recommendations, bus);

  bus.publishStatus(TF_AGENT_ID, "done", "Terraform apply complete");
  return { success: true, exitCode: 0, outputs, rootDir };
}

function mergeStack(
  plan: DeploymentPlan,
  recommendations: ServiceRecommendation[],
  bus: MessageBus,
): string {
  const baseDir = join(plan.workDir, "artifacts", "terraform", plan.provider);
  const rootDir = join(baseDir, "_root");
  mkdirSync(rootDir, { recursive: true });

  // Copy each agent's main.tf to <serviceId>.tf in the unified root
  for (const rec of recommendations) {
    const src = join(baseDir, rec.serviceId, "main.tf");
    if (!existsSync(src)) {
      bus.publishLog(TF_AGENT_ID, `skip ${rec.serviceId}: no main.tf at ${src}`);
      continue;
    }
    const dest = join(rootDir, `${sanitize(rec.serviceId)}.tf`);
    writeFileSync(dest, readFileSync(src, "utf-8"));
    bus.publishLog(TF_AGENT_ID, `merged ${rec.serviceId}.tf`);
  }

  writeFileSync(join(rootDir, "provider.tf"), buildProviderTf(plan));
  bus.publishLog(TF_AGENT_ID, `provider.tf written for ${plan.provider}/${plan.region}`);
  bus.publishLog(TF_AGENT_ID, `stack root: ${rootDir}`);

  return rootDir;
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, "_");
}

function buildProviderTf(plan: DeploymentPlan): string {
  if (plan.provider === "aws") {
    return `terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = "${plan.region}"
  default_tags {
    tags = {
      ManagedBy = "launch-platform"
      Project   = "${(plan.source.split(/[\\/]/).pop() ?? "launch").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase().slice(0, 40)}"
    }
  }
}
`;
  }
  if (plan.provider === "gcp") {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? "set-GOOGLE_CLOUD_PROJECT";
    return `terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 5.0" }
  }
}

provider "google" {
  project = "${projectId}"
  region  = "${plan.region}"
}
`;
  }
  return `# Unknown provider: ${plan.provider}\n`;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runTf(
  args: string[],
  cwd: string,
  bus: MessageBus,
  silent = false,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const proc = spawn("terraform", args, {
      cwd,
      env: process.env,
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (b) => {
      const text = b.toString();
      stdout += text;
      if (!silent) {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) bus.publishLog(TF_AGENT_ID, line);
        }
      }
    });

    proc.stderr?.on("data", (b) => {
      const text = b.toString();
      stderr += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) bus.publishLog(TF_AGENT_ID, line);
      }
    });

    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on("error", (err) => {
      const msg = err.message.includes("ENOENT")
        ? "`terraform` binary not found on PATH. Install terraform: https://developer.hashicorp.com/terraform/install"
        : err.message;
      bus.publishError(TF_AGENT_ID, msg);
      resolve({ code: 127, stdout, stderr: msg });
    });
  });
}

function publishOutputsToAgents(
  outputs: TfStreamResult["outputs"],
  recommendations: ServiceRecommendation[],
  bus: MessageBus,
): void {
  // Terraform top-level outputs: `vpc_id`, `instance_id`, etc. Try to map
  // each output back to its owning agent by serviceId prefix or known suffix.
  const idsByService = new Map(recommendations.map((r) => [r.serviceId, `${r.serviceId}-agent`]));

  for (const [key, raw] of Object.entries(outputs)) {
    const value = raw?.value;
    // Try to attribute the output to a specific agent
    let target: string | null = null;
    for (const [serviceId, agentId] of idsByService) {
      if (key.startsWith(serviceId.replace(/-/g, "_")) || key.includes(serviceId)) {
        target = agentId;
        break;
      }
    }
    if (target) {
      bus.publishOutput(target, `${key}_resolved`, value);
    } else {
      bus.publishOutput(TF_AGENT_ID, key, value);
    }
  }
}

export async function isTerraformAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("terraform", ["version"], {
      shell: process.platform === "win32",
      stdio: "ignore",
    });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}
