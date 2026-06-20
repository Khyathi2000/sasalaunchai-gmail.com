// OAuth callback. Google redirects here with `code` + `state` after the
// user grants consent. We exchange the code for tokens, capture the
// authorizing user's identity + projects, store the refresh token in
// the encrypted vault, and redirect back to the in-app deploy flow.

import { NextResponse } from "next/server";
import {
  exchangeCode,
  fetchUserInfo,
  isConfigured,
  listProjects,
  parseState,
} from "@/lib/auth/gcp-oauth";
import { putCredential } from "@/lib/credential-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isConfigured()) {
    return errorRedirect(req, "oauth_not_configured", "GCP OAuth is not configured.");
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  if (errParam) {
    return errorRedirect(req, "oauth_denied", `Google rejected the request: ${errParam}`);
  }
  if (!code || !state) {
    return errorRedirect(req, "missing_code_state", "Missing OAuth code or state parameter.");
  }

  let decodedState: { userId: string; sid?: string };
  try {
    decodedState = parseState(state);
  } catch (err) {
    return errorRedirect(
      req,
      "bad_state",
      err instanceof Error ? err.message : String(err),
    );
  }

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (err) {
    return errorRedirect(
      req,
      "token_exchange_failed",
      err instanceof Error ? err.message : String(err),
    );
  }
  if (!tokens.refresh_token) {
    return errorRedirect(
      req,
      "no_refresh_token",
      "Google did not return a refresh token. Revoke the existing grant at https://myaccount.google.com/permissions and retry.",
    );
  }

  const [userInfo, projects] = await Promise.all([
    fetchUserInfo(tokens.access_token),
    listProjects(tokens.access_token),
  ]);

  // Pick the first active project as the default. The UI can let the
  // user re-select via /api/auth/gcp/project later.
  const projectId = projects[0]?.projectId;

  await putCredential({
    userId: decodedState.userId,
    provider: "gcp",
    label: "default",
    payload: {
      // Tag the payload as oauth so credential-store knows to mint a
      // fresh access token at deploy time. We reuse the same row that
      // the manual service-account-JSON path uses; only one is active.
      kind: "oauth",
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      authorizedEmail: userInfo.email,
      projectId,
      availableProjects: projects.map((p) => ({ projectId: p.projectId, name: p.name })),
      // Empty serviceAccountJson satisfies the existing
      // GcpCredentialPlaintext shape; the kind discriminator tells
      // the hydrator which fields to actually use.
      serviceAccountJson: "",
    } as never,
    gcpProjectId: projectId,
  });

  // Bounce the user back to /app — if they came from the deploy flow,
  // ServiceGrid's deploy click can re-run the precheck and proceed.
  const target = new URL("/console", req.url);
  if (decodedState.sid) target.searchParams.set("sid", decodedState.sid);
  target.searchParams.set("authorized", "gcp");
  return NextResponse.redirect(target);
}

function errorRedirect(req: Request, code: string, message: string): Response {
  const target = new URL("/console", req.url);
  target.searchParams.set("authorize_error", code);
  target.searchParams.set("authorize_message", message);
  return NextResponse.redirect(target);
}
