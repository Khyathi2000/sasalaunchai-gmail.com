import { NextResponse } from "next/server";
import { inferServices, refineRecommendations } from "@/lib/core";
import { readSession, updateSession } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as {
    sid: string;
    provider: "aws" | "gcp";
    region: string;
    refine?: boolean;
  };
  const session = await readSession(body.sid, userId);
  if (!session?.codebase) {
    return NextResponse.json({ error: "session/codebase missing" }, { status: 404 });
  }

  let recommendations = inferServices(session.codebase, session.analysis, body.provider);

  if (body.refine && process.env.ANTHROPIC_API_KEY) {
    try {
      recommendations = await refineRecommendations(
        recommendations,
        session.codebase,
        session.analysis,
      );
    } catch {
      // Refinement is best-effort; ignore failures.
    }
  }

  await updateSession(body.sid, userId, (r) => ({ ...r, recommendations }));

  return NextResponse.json({ recommendations });
}
