// User has launched the CloudFormation stack and pasted the resulting
// RoleArn. We:
//   1. Call STS:AssumeRole with the ARN + externalId.
//   2. Call STS:GetCallerIdentity with the temp creds to confirm.
//   3. If both succeed, save (roleArn, externalId, region) to the vault
//      under the GCP / AWS provider with kind="role-arn".

import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/auth/user";
import { assumeRole, probeAssumedRole } from "@/lib/auth/aws-assume-role";
import { putCredential } from "@/lib/credential-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  roleArn: string;
  externalId: string;
  region?: string;
  label?: string;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as Body;

  if (!body.roleArn || !body.externalId) {
    return NextResponse.json(
      { error: "roleArn and externalId are required" },
      { status: 400 },
    );
  }
  if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/.test(body.roleArn)) {
    return NextResponse.json(
      { error: "roleArn doesn't look like a valid IAM role ARN" },
      { status: 400 },
    );
  }
  const region = body.region ?? "us-east-1";

  let identity;
  try {
    const creds = await assumeRole({
      roleArn: body.roleArn,
      externalId: body.externalId,
      region,
    });
    identity = await probeAssumedRole(creds, region);
  } catch (err) {
    return NextResponse.json(
      {
        error: "assume_role_failed",
        message:
          err instanceof Error
            ? err.message
            : "STS:AssumeRole failed. Confirm the trust policy targets our platform account and the External ID matches.",
      },
      { status: 400 },
    );
  }

  await putCredential({
    userId,
    provider: "aws",
    label: body.label ?? "default",
    payload: {
      // Discriminator + AssumeRole inputs. The legacy access-key fields
      // are filled with empty strings so the stored payload still
      // matches AwsCredentialPlaintext at the type layer; the kind
      // field is what credential-store branches on.
      kind: "role-arn",
      roleArn: body.roleArn,
      externalId: body.externalId,
      region,
      accessKeyId: "",
      secretAccessKey: "",
    } as never,
    awsAccountId: identity.accountId,
    awsRegion: region,
  });

  return NextResponse.json({
    ok: true,
    accountId: identity.accountId,
    assumedArn: identity.arn,
  });
}
