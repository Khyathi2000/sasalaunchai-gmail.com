// Credential store: hydrates process.env from the per-user vault and
// (still) accepts the legacy in-memory set* calls used by code paths that
// haven't been migrated to the vault yet.
//
// Why both: the deployment orchestrator reads creds from process.env (so
// terraform / aws-cli child processes inherit them). The vault is the
// durable source of truth; this module is the bridge.

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getCredential,
  type AwsCredentialPlaintext,
  type GcpCredentialPlaintext,
  type Provider,
} from "./credential-vault.js";

export type AWSCreds = AwsCredentialPlaintext;
export type GCPCreds = GcpCredentialPlaintext;

let _gcpCredFilePath: string | null = null;

/**
 * Set AWS credentials in process.env. Use {@link hydrateFromVault} when the
 * credentials should come from the user's stored vault entry.
 */
export function setAWSCredentials(creds: AWSCreds): void {
  process.env.AWS_ACCESS_KEY_ID = creds.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = creds.secretAccessKey;
  if (creds.sessionToken) process.env.AWS_SESSION_TOKEN = creds.sessionToken;
  if (creds.region) process.env.AWS_REGION = creds.region;
  process.env.AWS_DEFAULT_REGION = creds.region;
}

/**
 * Set GCP credentials by writing the service-account JSON to a 0600 temp
 * file and pointing GOOGLE_APPLICATION_CREDENTIALS at it.
 */
export function setGCPCredentials(creds: GCPCreds): { path: string; projectId?: string } {
  let parsed: { project_id?: string; client_email?: string };
  try {
    parsed = JSON.parse(creds.serviceAccountJson);
  } catch (err) {
    throw new Error(
      `Invalid GCP service account JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed.client_email) {
    throw new Error("Service account JSON missing client_email — paste the full key file");
  }

  const dir = join(tmpdir(), "launch-platform-creds");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "gcp-sa.json");
  writeFileSync(path, creds.serviceAccountJson, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
  if (creds.projectId || parsed.project_id) {
    process.env.GOOGLE_CLOUD_PROJECT = creds.projectId ?? parsed.project_id!;
  }
  _gcpCredFilePath = path;
  return { path, projectId: parsed.project_id };
}

/**
 * Load the user's vaulted credential for `provider` and hydrate process.env
 * (and a 0600 temp file for GCP) so the orchestrator and child processes
 * see them. No-op if the user has no entry for that provider.
 *
 * Returns true if creds were hydrated.
 */
export async function hydrateFromVault(
  userId: string,
  provider: Provider,
  label = "default",
): Promise<boolean> {
  const entry = await getCredential(userId, provider, label);
  if (!entry) return false;
  if (provider === "aws") {
    setAWSCredentials(entry.payload as AWSCreds);
  } else {
    setGCPCredentials(entry.payload as GCPCreds);
  }
  return true;
}

/**
 * Hydrate both providers if the user has them. Used by the deploy route
 * before kicking off terraform.
 */
export async function hydrateAllFromVault(userId: string): Promise<{
  aws: boolean;
  gcp: boolean;
}> {
  const [aws, gcp] = await Promise.all([
    hydrateFromVault(userId, "aws"),
    hydrateFromVault(userId, "gcp"),
  ]);
  return { aws, gcp };
}

export function getCredentialEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
    AWS_REGION: process.env.AWS_REGION,
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  };
}

export function getGCPCredFilePath(): string | null {
  if (_gcpCredFilePath && existsSync(_gcpCredFilePath)) return _gcpCredFilePath;
  return null;
}

/** Test-only: clear hydrated env so tests don't leak between cases. */
export function _resetEnvForTests(): void {
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;
  delete process.env.AWS_REGION;
  delete process.env.AWS_DEFAULT_REGION;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  _gcpCredFilePath = null;
}
