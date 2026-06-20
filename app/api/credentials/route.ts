// Credentials API. Reads + writes the per-user vault.
//
// GET  /api/credentials                 — list stored creds for current user
// POST /api/credentials                 — store / update AWS or GCP creds
// DELETE /api/credentials?provider=aws  — remove a stored cred
//
// Plus a "probe" mode: GET /api/credentials?probe=1 hydrates env from the
// vault and runs the live STS / SA probe so the UI can show identity
// strings without re-typing secrets.

import { NextResponse } from "next/server";
import {
  deleteCredential,
  listCredentials,
  putCredential,
  type Provider,
} from "@/lib/credential-vault";
import { hydrateFromVault } from "@/lib/credential-store";
import { probeCredentials } from "@/lib/credentials";
import { ensureUser } from "@/lib/auth/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await ensureUser();
  const url = new URL(req.url);
  if (url.searchParams.get("probe") === "1") {
    await Promise.all([
      hydrateFromVault(userId, "aws"),
      hydrateFromVault(userId, "gcp"),
    ]);
    const status = await probeCredentials();
    return NextResponse.json(status);
  }
  const stored = await listCredentials(userId);
  return NextResponse.json({ stored });
}

interface PostBody {
  aws?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
    label?: string;
  };
  gcp?: {
    serviceAccountJson: string;
    projectId?: string;
    label?: string;
  };
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as PostBody;

  const errors: { aws?: string; gcp?: string } = {};
  const stored: { aws?: unknown; gcp?: unknown } = {};

  if (body.aws) {
    try {
      if (!body.aws.accessKeyId || !body.aws.secretAccessKey || !body.aws.region) {
        throw new Error("accessKeyId, secretAccessKey, and region are required");
      }
      stored.aws = await putCredential({
        userId,
        provider: "aws",
        label: body.aws.label,
        payload: {
          accessKeyId: body.aws.accessKeyId,
          secretAccessKey: body.aws.secretAccessKey,
          sessionToken: body.aws.sessionToken,
          region: body.aws.region,
        },
        awsRegion: body.aws.region,
      });
    } catch (err) {
      errors.aws = err instanceof Error ? err.message : String(err);
    }
  }

  if (body.gcp) {
    try {
      // Validate JSON parses + has client_email before we encrypt.
      const parsed = JSON.parse(body.gcp.serviceAccountJson) as {
        project_id?: string;
        client_email?: string;
      };
      if (!parsed.client_email) {
        throw new Error("Service account JSON missing client_email");
      }
      const projectId = body.gcp.projectId ?? parsed.project_id;
      stored.gcp = await putCredential({
        userId,
        provider: "gcp",
        label: body.gcp.label,
        payload: {
          serviceAccountJson: body.gcp.serviceAccountJson,
          projectId,
        },
        gcpProjectId: projectId,
      });
    } catch (err) {
      errors.gcp = err instanceof Error ? err.message : String(err);
    }
  }

  // Hydrate + probe with the freshly stored creds so the UI has live
  // identity info on its first paint.
  await Promise.all([
    hydrateFromVault(userId, "aws"),
    hydrateFromVault(userId, "gcp"),
  ]);
  const status = await probeCredentials();

  return NextResponse.json({ status, errors, stored });
}

export async function DELETE(req: Request) {
  const userId = await ensureUser();
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") as Provider | null;
  const label = url.searchParams.get("label") ?? "default";
  if (provider !== "aws" && provider !== "gcp") {
    return NextResponse.json(
      { error: "provider query param must be 'aws' or 'gcp'" },
      { status: 400 },
    );
  }
  const deleted = await deleteCredential(userId, provider, label);
  return NextResponse.json({ deleted });
}
