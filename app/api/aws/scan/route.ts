import { NextResponse } from "next/server";
import { sseResponse } from "@/lib/sse-server";
import { discoverAWSAccount } from "@core/monitoring/collectors/aws-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ScanRequestBody {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export async function POST(req: Request) {
  let body: ScanRequestBody;
  try {
    body = (await req.json()) as ScanRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.accessKeyId || !body.secretAccessKey || !body.region) {
    return NextResponse.json(
      { error: "accessKeyId, secretAccessKey, and region are required" },
      { status: 400 },
    );
  }

  return sseResponse(async (ctrl) => {
    await discoverAWSAccount(
      {
        accessKeyId: body.accessKeyId,
        secretAccessKey: body.secretAccessKey,
        sessionToken: body.sessionToken,
        region: body.region,
      },
      (event) => {
        if (event.type === "progress" || event.type === "error") {
          ctrl.send(event.type, { service: event.service, message: event.message });
        } else {
          ctrl.send(event.type, event.data);
        }
      },
    );
    ctrl.send("done", { collectedAt: new Date().toISOString() });
  });
}
