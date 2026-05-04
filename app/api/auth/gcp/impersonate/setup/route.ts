// Returns the gcloud commands the user runs in their own GCP project to
// set up service-account impersonation. The UI shows these commands as
// copy-paste-able blocks.

import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/auth/user";
import { getPlatformIdentity } from "@/lib/auth/gcp-impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureUser();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? "<YOUR_PROJECT_ID>";
  const saName = url.searchParams.get("saName") ?? "sasa-launch-deployer";

  let platform;
  try {
    platform = await getPlatformIdentity();
  } catch (err) {
    return NextResponse.json(
      {
        error: "platform_identity_missing",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const targetSa = `${saName}@${projectId}.iam.gserviceaccount.com`;

  return NextResponse.json({
    platformServiceAccount: platform.email,
    platformIamMember: platform.iamMember,
    platformSource: platform.source,
    targetServiceAccount: targetSa,
    suggestedSaName: saName,
    projectIdPlaceholder: projectId,
    commands: [
      {
        title: "1. Create the deployer service account",
        cmd: `gcloud iam service-accounts create ${saName} --project=${projectId} --display-name="Sasa Launch deployer"`,
      },
      {
        title: "2. Grant deployment permissions on it (Editor is broad — scope down for prod)",
        cmd: `gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:${targetSa}" --role="roles/editor"`,
      },
      {
        title: "3. Allow Sasa Launch to impersonate it (the production-grade trust step)",
        cmd: `gcloud iam service-accounts add-iam-policy-binding ${targetSa} --member="${platform.iamMember}" --role="roles/iam.serviceAccountTokenCreator" --project=${projectId}`,
      },
    ],
    notes: [
      `No long-lived keys are exchanged. We mint short-lived access tokens via iamcredentials.generateAccessToken on ${targetSa}, gated by the tokenCreator binding above.`,
      `Revoke at any time by removing the binding: gcloud iam service-accounts remove-iam-policy-binding ${targetSa} --member="${platform.iamMember}" --role="roles/iam.serviceAccountTokenCreator"`,
    ],
  });
}
