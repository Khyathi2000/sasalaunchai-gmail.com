import { NextResponse } from "next/server";
import { readSession } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";
import { getOrchestrator } from "@/lib/bus-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ sid: string }> }) {
  const userId = await ensureUser();
  const { sid } = await params;
  const session = await readSession(sid, userId);
  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const orchLive = !!(session.planId && getOrchestrator(session.planId));
  return NextResponse.json({ session, orchestratorLive: orchLive });
}
