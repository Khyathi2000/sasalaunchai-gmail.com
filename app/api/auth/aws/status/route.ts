import { NextResponse } from "next/server";
import { getPlatformAccountId } from "@/lib/auth/aws-assume-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Modal uses this to decide whether to show the "Launch in AWS" button.
 * When the platform has no AWS identity, AssumeRole won't work and we
 * surface the manual-paste path instead. */
export async function GET() {
  try {
    const trustedAccount = await getPlatformAccountId();
    return NextResponse.json({ configured: true, trustedAccount });
  } catch (err) {
    return NextResponse.json({
      configured: false,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
