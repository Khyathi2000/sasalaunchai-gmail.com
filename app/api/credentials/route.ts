import { NextResponse } from "next/server";
import { probeCredentials } from "@/lib/credentials";
import { setAWSCredentials, setGCPCredentials } from "@/lib/credential-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await probeCredentials();
  return NextResponse.json(status);
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    aws?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string };
    gcp?: { serviceAccountJson: string; projectId?: string };
  };

  const errors: { aws?: string; gcp?: string } = {};

  if (body.aws) {
    try {
      if (!body.aws.accessKeyId || !body.aws.secretAccessKey || !body.aws.region) {
        throw new Error("accessKeyId, secretAccessKey, and region are required");
      }
      setAWSCredentials(body.aws);
    } catch (err) {
      errors.aws = err instanceof Error ? err.message : String(err);
    }
  }

  if (body.gcp) {
    try {
      setGCPCredentials(body.gcp);
    } catch (err) {
      errors.gcp = err instanceof Error ? err.message : String(err);
    }
  }

  const status = await probeCredentials();
  return NextResponse.json({ status, errors });
}
