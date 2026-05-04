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

export interface PlatformIdentity {
  /** What goes in the IAM binding: "serviceAccount:foo@..." or "user:foo@gmail.com". */
  iamMember: string;
  /** Just the email (no prefix). Shown to the user. */
  email: string;
  /** Where we found it — drives copy in the setup wizard. */
  source: "env" | "metadata" | "service-account-json" | "adc-user" | "adc-via-gcloud";
}

/**
 * Returns the platform identity — what users grant tokenCreator to.
 * Resolution order:
 *   1. GCP_PLATFORM_SA_EMAIL env var (explicit, always treated as SA)
 *   2. Cloud Run / GCE metadata server (only on GCP runtime)
 *   3. GOOGLE_APPLICATION_CREDENTIALS JSON file
 *      a. service_account-shaped → SA email
 *      b. authorized_user-shaped (ADC from `gcloud auth ...`) → user email
 *         (read via google-auth-library getCredentials())
 *   4. `gcloud config get-value account` as a last resort
 */
export async function getPlatformIdentity(): Promise<PlatformIdentity> {
  const explicit = process.env.GCP_PLATFORM_SA_EMAIL?.trim();
  if (explicit) {
    return { iamMember: `serviceAccount:${explicit}`, email: explicit, source: "env" };
  }

  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(1000) },
    );
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text) return { iamMember: `serviceAccount:${text}`, email: text, source: "metadata" };
    }
  } catch {
    // not on a GCP runtime
  }

  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credsPath) {
    try {
      const { readFileSync } = await import(/* webpackIgnore: true */ "fs");
      const json = JSON.parse(readFileSync(credsPath, "utf-8")) as {
        type?: string;
        client_email?: string;
      };
      if (json.client_email) {
        return {
          iamMember: `serviceAccount:${json.client_email}`,
          email: json.client_email,
          source: "service-account-json",
        };
      }
      if (json.type === "authorized_user") {
        // ADC user creds — pull the email via google-auth-library so we
        // can show the user which account is connected.
        const userEmail = await emailFromAdcUser();
        if (userEmail) {
          return { iamMember: `user:${userEmail}`, email: userEmail, source: "adc-user" };
        }
      }
    } catch {
      // fall through
    }
  }

  // Last resort: try the default ADC chain via google-auth-library.
  try {
    const userEmail = await emailFromAdcUser();
    if (userEmail) {
      return { iamMember: `user:${userEmail}`, email: userEmail, source: "adc-via-gcloud" };
    }
  } catch {
    // fall through
  }

  throw new Error(
    "Could not determine the platform identity. Run `gcloud auth application-default login` (uses your Google account) OR set GCP_PLATFORM_SA_EMAIL + point GOOGLE_APPLICATION_CREDENTIALS at a service-account JSON key.",
  );
}

/** Backwards-compatible: returns just the email string. Prefer
 * getPlatformIdentity for new code. */
export async function getPlatformServiceAccountEmail(): Promise<string> {
  const id = await getPlatformIdentity();
  return id.email;
}

async function emailFromAdcUser(): Promise<string | null> {
  try {
    const mod = await import(/* webpackIgnore: true */ "google-auth-library");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = new (mod as unknown as { GoogleAuth: any }).GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/userinfo.email"],
    });
    const tokenResp = await auth.getAccessToken();
    if (!tokenResp.token) return null;
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenResp.token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
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
