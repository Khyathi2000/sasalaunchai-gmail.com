// Probes for local AWS/GCP credentials. Runs only on the server (Node runtime).

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface CredentialStatus {
  aws: { ok: boolean; accountId?: string; region?: string; error?: string };
  gcp: { ok: boolean; projectId?: string; needsAuth: boolean; error?: string };
}

export async function probeCredentials(): Promise<CredentialStatus> {
  const [aws, gcp] = await Promise.all([probeAWS(), probeGCP()]);
  return { aws, gcp };
}

async function probeAWS(): Promise<CredentialStatus["aws"]> {
  try {
    const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
    const client = new STSClient({ region: process.env.AWS_REGION || "us-east-1" });
    const res = await client.send(new GetCallerIdentityCommand({}));
    return {
      ok: true,
      accountId: res.Account,
      region: process.env.AWS_REGION || "us-east-1",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeGCP(): Promise<CredentialStatus["gcp"]> {
  // 1. GOOGLE_OAUTH_ACCESS_TOKEN — set by hydrateGcpOauth when the user
  //    authorized via Google OAuth. Trust it if present + project id.
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GOOGLE_PROJECT;
    return { ok: true, projectId, needsAuth: false };
  }

  // 2. GOOGLE_APPLICATION_CREDENTIALS env var (service account JSON path)
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath && existsSync(envPath)) {
    try {
      const sa = JSON.parse(readFileSync(envPath, "utf-8")) as { project_id?: string };
      return { ok: true, projectId: sa.project_id, needsAuth: false };
    } catch {
      // fall through
    }
  }

  // 3. ADC at default location (gcloud auth application-default login)
  const adcPath = join(homedir(), ".config", "gcloud", "application_default_credentials.json");
  if (existsSync(adcPath)) {
    try {
      const adc = JSON.parse(readFileSync(adcPath, "utf-8")) as { quota_project_id?: string };
      const projectId = adc.quota_project_id ?? readActiveProject();
      return { ok: true, projectId, needsAuth: false };
    } catch {
      // fall through
    }
  }

  return {
    ok: false,
    needsAuth: true,
    error: "No GCP credentials found. Authorize via Google in the deploy modal, paste a service-account JSON, or run `gcloud auth application-default login`.",
  };
}

function readActiveProject(): string | undefined {
  // Try gcloud's active config file
  const configPath = join(homedir(), ".config", "gcloud", "active_config");
  if (!existsSync(configPath)) return undefined;
  try {
    const active = readFileSync(configPath, "utf-8").trim();
    const propsPath = join(homedir(), ".config", "gcloud", "configurations", `config_${active}`);
    if (!existsSync(propsPath)) return undefined;
    const text = readFileSync(propsPath, "utf-8");
    const match = text.match(/^project\s*=\s*(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}
