// In-process credential store. Sets process.env so the AWS SDK and any
// child processes (terraform, gcloud) see the same credentials. Local-only.

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export interface AWSCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface GCPCreds {
  serviceAccountJson: string;
  projectId?: string;
}

let _gcpCredFilePath: string | null = null;

export function setAWSCredentials(creds: AWSCreds): void {
  process.env.AWS_ACCESS_KEY_ID = creds.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = creds.secretAccessKey;
  if (creds.sessionToken) process.env.AWS_SESSION_TOKEN = creds.sessionToken;
  if (creds.region) process.env.AWS_REGION = creds.region;
  process.env.AWS_DEFAULT_REGION = creds.region;
}

export function setGCPCredentials(creds: GCPCreds): { path: string; projectId?: string } {
  // Validate it parses
  let parsed: { project_id?: string; client_email?: string };
  try {
    parsed = JSON.parse(creds.serviceAccountJson);
  } catch (err) {
    throw new Error(`Invalid GCP service account JSON: ${err instanceof Error ? err.message : String(err)}`);
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
  return _gcpCredFilePath;
}

export function setGitHubToken(token: string): void {
  process.env.GITHUB_TOKEN = token;
}

export function hasGitHubToken(): boolean {
  return !!process.env.GITHUB_TOKEN;
}
