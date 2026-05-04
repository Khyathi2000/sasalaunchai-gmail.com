// GCP service-account impersonation. Used as the production-grade
// alternative to pasting a service-account JSON key.
//
// Flow:
//   - User creates a service account in their project (e.g.
//     sasa-launch-deployer@PROJECT.iam.gserviceaccount.com), grants it
//     the IAM roles needed for deployment.
//   - User grants OUR platform service account the
//     `roles/iam.serviceAccountTokenCreator` role on THEIR deployer SA.
//   - At deploy time we call iamcredentials.generateAccessToken on
//     their SA, mint a 1-hour token, and use it for Terraform.
//
// What we store: { kind: "impersonate", serviceAccountEmail, projectId }.
// No keys ever touch disk.

export interface ImpersonationToken {
  accessToken: string;
  expiresAt: Date;
}

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

interface GoogleAuthLike {
  getAccessToken(): Promise<{ token?: string | null }>;
}

let _platformAuth: GoogleAuthLike | null = null;

async function platformAuth(): Promise<GoogleAuthLike> {
  if (_platformAuth) return _platformAuth;
  const mod = await import(
    /* webpackIgnore: true */ "google-auth-library"
  );
  // Ambient typing — google-auth-library has its own types but we keep
  // the surface minimal here so we can swap to a stub in tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _platformAuth = new (mod as unknown as { GoogleAuth: any }).GoogleAuth({
    scopes: SCOPES,
  }) as GoogleAuthLike;
  return _platformAuth;
}

/** Test hook: inject a stub platform auth implementation. */
export function _setPlatformAuthForTest(p: GoogleAuthLike | null): void {
  _platformAuth = p;
}

/**
 * Mint a short-lived access token by impersonating the user's deployer
 * SA. Authenticated as our platform principal (Cloud Run runtime SA, or
 * GOOGLE_APPLICATION_CREDENTIALS for local dev).
 *
 * Throws when:
 *  - we can't authenticate as the platform (env not set up)
 *  - the user hasn't granted us tokenCreator on their SA (403)
 *  - the SA email is malformed
 */
export async function mintImpersonationToken(
  targetServiceAccountEmail: string,
  scopes: string[] = SCOPES,
  lifetimeSeconds = 3600,
): Promise<ImpersonationToken> {
  const auth = await platformAuth();
  const tokenResp = await auth.getAccessToken();
  const platformAccessToken = tokenResp.token;
  if (!platformAccessToken) {
    throw new Error(
      "Platform credentials are not configured. Set GOOGLE_APPLICATION_CREDENTIALS (local dev) or attach a runtime SA on Cloud Run.",
    );
  }

  const url = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(targetServiceAccountEmail)}:generateAccessToken`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${platformAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scope: scopes,
      lifetime: `${lifetimeSeconds}s`,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`generateAccessToken failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { accessToken?: string; expireTime?: string };
  if (!data.accessToken || !data.expireTime) {
    throw new Error("generateAccessToken returned no token / expiry");
  }
  return {
    accessToken: data.accessToken,
    expiresAt: new Date(data.expireTime),
  };
}

/**
 * Returns the platform service account email — what users grant
 * tokenCreator on. Looks at:
 *  1. GCP_PLATFORM_SA_EMAIL env var (explicit)
 *  2. The Cloud Run / GCE metadata server (when running in GCP)
 *  3. GOOGLE_APPLICATION_CREDENTIALS JSON file (local dev)
 */
export async function getPlatformServiceAccountEmail(): Promise<string> {
  const explicit = process.env.GCP_PLATFORM_SA_EMAIL?.trim();
  if (explicit) return explicit;

  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(1000) },
    );
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text) return text;
    }
  } catch {
    // not on a GCP runtime
  }

  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credsPath) {
    try {
      const { readFileSync } = await import(/* webpackIgnore: true */ "fs");
      const sa = JSON.parse(readFileSync(credsPath, "utf-8")) as { client_email?: string };
      if (sa.client_email) return sa.client_email;
    } catch {
      // fall through
    }
  }
  throw new Error(
    "Could not determine the platform service-account email. Set GCP_PLATFORM_SA_EMAIL in env, or run with GOOGLE_APPLICATION_CREDENTIALS pointing at a JSON key.",
  );
}

/** Pretty error wrapper that turns IAM 403s into actionable advice. */
export function explainImpersonationError(
  err: unknown,
  targetSa: string,
  platformSa: string,
): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/PERMISSION_DENIED|403/i.test(msg)) {
    return `${platformSa} cannot impersonate ${targetSa}. Grant roles/iam.serviceAccountTokenCreator on ${targetSa} to ${platformSa} and retry. Original: ${msg}`;
  }
  if (/NOT_FOUND|404/i.test(msg)) {
    return `Service account ${targetSa} doesn't exist in the target project. Create it first. Original: ${msg}`;
  }
  return msg;
}
