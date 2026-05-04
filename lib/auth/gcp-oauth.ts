// Google OAuth 2.0 helper for GCP cloud-platform access.
//
// Setup (one time, in your own GCP project):
//   1. Console → APIs & Services → OAuth consent screen → External
//      (or Internal if Workspace). Add your email + app name.
//   2. Console → APIs & Services → Credentials → Create credentials →
//      OAuth client ID → Web application. Add redirect URI:
//        https://<your-domain>/api/auth/gcp/callback
//        http://localhost:3001/api/auth/gcp/callback   (for local dev)
//   3. Set env vars:
//        GCP_OAUTH_CLIENT_ID=...
//        GCP_OAUTH_CLIENT_SECRET=...
//        GCP_OAUTH_REDIRECT_URI=https://<your-domain>/api/auth/gcp/callback
//   4. Done — the "Authorize via Google" button now works.
//
// Why we need OAuth: we want the user to authorize our app to talk to
// THEIR GCP project (deploy resources, read billing) without them
// pasting a service-account JSON. The refresh token lets us mint fresh
// access tokens at deploy time, which Terraform consumes via the
// GOOGLE_OAUTH_ACCESS_TOKEN env var.

import { randomBytes } from "crypto";

export const SCOPES = [
  // Full read/write to GCP resources we deploy.
  "https://www.googleapis.com/auth/cloud-platform",
  // Read billing accounts so the UI can let the user pick one.
  "https://www.googleapis.com/auth/cloud-billing.readonly",
  // Identity (so we know which Google user authorized).
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class OAuthNotConfiguredError extends Error {
  constructor() {
    super(
      "GCP OAuth is not configured. Set GCP_OAUTH_CLIENT_ID, GCP_OAUTH_CLIENT_SECRET, and GCP_OAUTH_REDIRECT_URI in env. See lib/auth/gcp-oauth.ts for setup steps.",
    );
    this.name = "OAuthNotConfiguredError";
  }
}

export function getConfig(): OAuthConfig {
  const clientId = process.env.GCP_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GCP_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GCP_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new OAuthNotConfiguredError();
  }
  return { clientId, clientSecret, redirectUri };
}

export function isConfigured(): boolean {
  return (
    !!process.env.GCP_OAUTH_CLIENT_ID &&
    !!process.env.GCP_OAUTH_CLIENT_SECRET &&
    !!process.env.GCP_OAUTH_REDIRECT_URI
  );
}

/** State token: signed nonce that we round-trip through Google so the
 * callback can verify the request originated from us and resume the
 * right session. */
export function makeState(payload: { userId: string; sid?: string }): string {
  const nonce = randomBytes(16).toString("hex");
  const data = JSON.stringify({ ...payload, nonce, ts: Date.now() });
  return Buffer.from(data).toString("base64url");
}

export function parseState(state: string): { userId: string; sid?: string } {
  const data = Buffer.from(state, "base64url").toString("utf8");
  const parsed = JSON.parse(data) as { userId: string; sid?: string; ts: number };
  // Reject states older than 10 minutes — guards against replay.
  if (Date.now() - parsed.ts > 10 * 60 * 1000) {
    throw new Error("OAuth state expired; restart the authorize flow.");
  }
  return { userId: parsed.userId, sid: parsed.sid };
}

export function buildAuthUrl(state: string): string {
  const cfg = getConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // ensures we get a refresh_token
    prompt: "consent", // force re-consent so refresh_token is always returned
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
  id_token?: string;
}

export async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const cfg = getConfig();
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const cfg = getConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google refresh-token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

/**
 * After token exchange we hit Google's userinfo endpoint to capture the
 * authorizing user's email — useful for the dashboard so the user knows
 * which Google account is connected.
 */
export async function fetchUserInfo(accessToken: string): Promise<{ email?: string }> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return {};
  return (await res.json()) as { email?: string };
}

/** List billing accounts the authorizing user has access to. The UI
 * lets them pick one, which we link to the project before deploying. */
export async function listBillingAccounts(
  accessToken: string,
): Promise<Array<{ name: string; displayName: string; open: boolean }>> {
  const res = await fetch("https://cloudbilling.googleapis.com/v1/billingAccounts", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    billingAccounts?: Array<{ name: string; displayName: string; open: boolean }>;
  };
  return data.billingAccounts ?? [];
}

/** List GCP projects the authorizing user has access to. */
export async function listProjects(
  accessToken: string,
): Promise<Array<{ projectId: string; name: string; lifecycleState: string }>> {
  const res = await fetch("https://cloudresourcemanager.googleapis.com/v1/projects", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    projects?: Array<{ projectId: string; name: string; lifecycleState: string }>;
  };
  return (data.projects ?? []).filter((p) => p.lifecycleState === "ACTIVE");
}
