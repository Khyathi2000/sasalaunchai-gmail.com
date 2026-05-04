import { NextResponse } from "next/server";
import { getPlatformServiceAccountEmail } from "@/lib/auth/gcp-impersonation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Modal uses this to decide whether to show the "Configure SA
 * impersonation" wizard. Without a platform SA we can't impersonate;
 * surface OAuth + manual paste only. */
export async function GET() {
  try {
    const platformServiceAccount = await getPlatformServiceAccountEmail();
    return NextResponse.json({ configured: true, platformServiceAccount });
  } catch (err) {
    return NextResponse.json({
      configured: false,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
