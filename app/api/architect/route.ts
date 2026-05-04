import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/auth/user";
import { readSession, updateSession } from "@/lib/sessions";
import { runArchitectTurn, type ChatMessage } from "@core/architect/agent.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as {
    sid: string;
    message: string;
  };
  if (!body.sid || !body.message) {
    return NextResponse.json({ error: "sid and message are required" }, { status: 400 });
  }

  const session = await readSession(body.sid, userId);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }
  const recs = session.recommendations ?? [];
  const provider = (session.plan?.provider as "aws" | "gcp") ?? "aws";
  const region = session.plan?.region ?? "us-east-1";
  const mode = session.planId ? "post-deploy" : "pre-deploy";

  const history: ChatMessage[] = (session.chatHistory ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let result;
  try {
    result = await runArchitectTurn({
      state: { provider, region, recommendations: recs },
      history,
      userMessage: body.message,
      mode,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // Persist the new recommendation list, the chat history, and the
  // mutation log on the session.
  await updateSession(body.sid, userId, (r) => ({
    ...r,
    recommendations: result.state.recommendations,
    chatHistory: [
      ...(r.chatHistory ?? []),
      { role: "user", content: body.message, ts: new Date().toISOString() },
      { role: "assistant", content: result.reply, ts: new Date().toISOString() },
    ],
    architectMutations: [
      ...(r.architectMutations ?? []),
      ...result.mutations.map((m) => ({
        ts: m.ts,
        kind: m.tool as never,
        before: m.before,
        after: m.after,
        rationale: m.rationale,
      })),
    ],
  }));

  return NextResponse.json({
    reply: result.reply,
    mutations: result.mutations,
    state: {
      provider: result.state.provider,
      region: result.state.region,
      recommendations: result.state.recommendations,
    },
  });
}
