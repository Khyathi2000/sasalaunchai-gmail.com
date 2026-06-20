// AWS AssumeRole helper. Used at both onboarding (verify the role works
// before saving) and deploy time (mint short-lived creds for terraform).
//
// The pattern: the user creates an IAM role in their account whose trust
// policy lets OUR identity assume it, gated by a per-credential
// externalId. We never store long-lived AWS keys — just (roleArn,
// externalId, region) — and we mint fresh STS creds on demand.

import { randomBytes } from "crypto";

export interface AssumeRoleResult {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

/** Cryptographically random external ID. 16 bytes hex = 32 chars,
 * matching AWS's recommended minimum length. */
export function generateExternalId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * AssumeRole and return the temporary credentials. Caller is responsible
 * for putting them on process.env (see hydrateAwsRoleArn in
 * credential-store).
 *
 * Throws on probe failure — caller surfaces the message in the UI.
 */
export async function assumeRole(opts: {
  roleArn: string;
  externalId: string;
  sessionName?: string;
  region?: string;
  durationSeconds?: number;
}): Promise<AssumeRoleResult> {
  const { STSClient, AssumeRoleCommand } = await import(
    /* webpackIgnore: true */ "@aws-sdk/client-sts"
  );
  // Region for STS itself isn't load-bearing (STS is global) — but the
  // SDK requires one. Default to the deploy region or us-east-1.
  const client = new STSClient({ region: opts.region ?? "us-east-1" });
  const resp = await client.send(
    new AssumeRoleCommand({
      RoleArn: opts.roleArn,
      RoleSessionName: opts.sessionName ?? "sasa-launch-deploy",
      ExternalId: opts.externalId,
      DurationSeconds: opts.durationSeconds ?? 3600, // 1 hour default
    }),
  );
  const c = resp.Credentials;
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken || !c.Expiration) {
    throw new Error("STS:AssumeRole returned incomplete credentials");
  }
  return {
    accessKeyId: c.AccessKeyId,
    secretAccessKey: c.SecretAccessKey,
    sessionToken: c.SessionToken,
    expiration: c.Expiration,
  };
}

/** STS:GetCallerIdentity using the assumed role — confirms the trust
 * policy and external ID actually work end-to-end. Returns the assumed
 * principal's ARN and account ID. */
export async function probeAssumedRole(
  creds: AssumeRoleResult,
  region?: string,
): Promise<{ accountId: string; arn: string }> {
  const { STSClient, GetCallerIdentityCommand } = await import(
    /* webpackIgnore: true */ "@aws-sdk/client-sts"
  );
  const client = new STSClient({
    region: region ?? "us-east-1",
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
  const resp = await client.send(new GetCallerIdentityCommand({}));
  if (!resp.Account || !resp.Arn) {
    throw new Error("STS:GetCallerIdentity returned no account/arn");
  }
  return { accountId: resp.Account, arn: resp.Arn };
}

/**
 * Returns the AWS account ID the platform itself runs as. Determines
 * the "TrustedAccountId" baked into the CloudFormation template.
 *
 * Resolution: AWS_PLATFORM_ACCOUNT_ID env var → STS:GetCallerIdentity
 * with whatever default creds the runtime has. For self-hosted, set the
 * env var to your AWS account ID once and forget it.
 */
export async function getPlatformAccountId(): Promise<string> {
  const explicit = process.env.AWS_PLATFORM_ACCOUNT_ID?.trim();
  if (explicit) return explicit;
  try {
    const { STSClient, GetCallerIdentityCommand } = await import(
      /* webpackIgnore: true */ "@aws-sdk/client-sts"
    );
    const client = new STSClient({});
    const resp = await client.send(new GetCallerIdentityCommand({}));
    if (resp.Account) return resp.Account;
  } catch {
    // fall through
  }
  throw new Error(
    "AWS_PLATFORM_ACCOUNT_ID is not set and STS:GetCallerIdentity failed. Set the env var to the AWS account hosting this app.",
  );
}
