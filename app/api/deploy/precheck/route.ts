// Pre-deploy credential check. Called by the UI right before kicking
// off /api/deploy so we can prompt for cloud auth inline instead of
// letting terraform fail with a cryptic credentials error.
//
// For the plan's target provider, we:
//   1. See if the user has a stored credential in the vault.
//   2. Hydrate process.env from it.
//   3. Run the live identity probe (STS for AWS, SA validation for GCP).
//   4. Return { ready: bool, reason, provider, identity? }.

import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/auth/user";
import { readSession } from "@/lib/sessions";
import { hydrateFromVault } from "@/lib/credential-store";
import { listCredentials } from "@/lib/credential-vault";
import { probeCredentials } from "@/lib/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await ensureUser();
  const { sid } = (await req.json()) as { sid: string };
  if (!sid) {
    return NextResponse.json({ error: "sid required" }, { status: 400 });
  }
  const session = await readSession(sid, userId);
  if (!session?.plan) {
    return NextResponse.json({ error: "no plan in session" }, { status: 404 });
  }
  const provider = session.plan.provider as "aws" | "gcp";

  // Has the user stored a cred for this provider?
  const stored = await listCredentials(userId, provider);
  if (stored.length === 0) {
    return NextResponse.json({
      ready: false,
      reason: "no_credential",
      provider,
      message: `No ${provider.toUpperCase()} credentials saved yet.`,
    });
  }

  // Hydrate + live probe.
  await hydrateFromVault(userId, provider);
  const status = await probeCredentials();
  const branch = status[provider];
  if (!branch.ok) {
    return NextResponse.json({
      ready: false,
      reason: "invalid_credential",
      provider,
      message: branch.error ?? `${provider.toUpperCase()} credentials failed identity probe.`,
    });
  }
  const identity =
    provider === "aws"
      ? (status.aws.accountId ?? null)
      : (status.gcp.projectId ?? null);
  return NextResponse.json({ ready: true, provider, identity });
}
