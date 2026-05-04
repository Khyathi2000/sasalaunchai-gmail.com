// User has run the gcloud commands. Tests impersonation end-to-end by
// minting a token via generateAccessToken; if that succeeds the binding
// is correctly in place and we save the credential.

import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/auth/user";
import {
  explainImpersonationError,
  getPlatformServiceAccountEmail,
  mintImpersonationToken,
} from "@/lib/auth/gcp-impersonation";
import { putCredential } from "@/lib/credential-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  serviceAccountEmail: string;
  projectId?: string;
  label?: string;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as Body;

  const sa = body.serviceAccountEmail?.trim();
  if (!sa || !/^[\w.+-]+@[\w.-]+\.iam\.gserviceaccount\.com$/.test(sa)) {
    return NextResponse.json(
      { error: "serviceAccountEmail must be a valid SA email like name@PROJECT.iam.gserviceaccount.com" },
      { status: 400 },
    );
  }

  // Best-effort project id: use the body, else parse from the SA email.
  const projectId =
    body.projectId?.trim() || sa.match(/@([^.]+)\.iam\.gserviceaccount\.com$/)?.[1];

  let platformSa: string;
  try {
    platformSa = await getPlatformServiceAccountEmail();
  } catch (err) {
    return NextResponse.json(
      {
        error: "platform_identity_missing",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  try {
    await mintImpersonationToken(sa);
  } catch (err) {
    return NextResponse.json(
      {
        error: "impersonation_failed",
        message: explainImpersonationError(err, sa, platformSa),
      },
      { status: 400 },
    );
  }

  await putCredential({
    userId,
    provider: "gcp",
    label: body.label ?? "default",
    payload: {
      kind: "impersonate",
      serviceAccountEmail: sa,
      projectId,
      // Empty serviceAccountJson satisfies the existing payload shape.
      serviceAccountJson: "",
    } as never,
    gcpProjectId: projectId,
  });

  return NextResponse.json({
    ok: true,
    serviceAccountEmail: sa,
    projectId,
    platformServiceAccount: platformSa,
  });
}
