// Returns everything the UI needs to open the CloudFormation Quick-Create
// flow:
//   - quickCreateUrl: the AWS Console URL pre-filled with our template
//     and parameters. User clicks → AWS opens → they review → click
//     Create → stack provisions in ~30s.
//   - externalId: returned to the UI so the verify call can re-supply
//     it. We do NOT store it in the vault until verify succeeds.
//   - templateUrl: raw template (for users who want to inspect before
//     launching).

import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/auth/user";
import { generateExternalId, getPlatformAccountId } from "@/lib/auth/aws-assume-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureUser();
  let trustedAccount: string;
  try {
    trustedAccount = await getPlatformAccountId();
  } catch (err) {
    return NextResponse.json(
      {
        error: "platform_identity_missing",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
  const externalId = generateExternalId();
  const url = new URL(req.url);
  const region = url.searchParams.get("region") ?? "us-east-1";

  // Build the public template URL — same origin as the request.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;
  const templateUrl = `${origin}/api/auth/aws/cfn-template`;

  // CloudFormation Quick-Create requires templateURL to be HTTPS and
  // publicly reachable. For local dev we surface a fallback path: the
  // UI can show the YAML inline + a "copy" button, and the user pastes
  // it into the CloudFormation console manually.
  const isPublic = origin.startsWith("https://");

  const stackName = "sasa-launch-deploy-role";
  const params = new URLSearchParams({
    stackName,
    templateURL: templateUrl,
    [`param_ExternalId`]: externalId,
  });
  const quickCreateUrl = `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/quickcreate?${params.toString()}`;

  return NextResponse.json({
    quickCreateUrl,
    externalId,
    templateUrl,
    trustedAccount,
    region,
    isPublicTemplateUrl: isPublic,
    docs: {
      stackName,
      manualSteps: [
        "Click 'Launch in AWS' (or copy the template if you're on localhost).",
        "Review the stack — it creates one IAM role with AdministratorAccess by default.",
        "Click 'Create stack'. Wait ~30 seconds for CREATE_COMPLETE.",
        "Copy the RoleArn from the Outputs tab.",
        "Paste it back here to finish the connection.",
      ],
    },
  });
}
