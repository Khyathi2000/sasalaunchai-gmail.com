import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/auth/gcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** UI uses this to decide whether to enable the "Authorize via Google"
 * button. No auth needed — it only reveals presence-of-env. */
export async function GET() {
  return NextResponse.json({ configured: isConfigured() });
}
