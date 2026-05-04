import { runParserAgent, runAnalyzerAgent, RepoNotAccessibleError } from "@/lib/core";
import { sseResponse } from "@/lib/sse-server";
import { newSessionId, updateSession } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";
import { getCurrentUserGithubToken, GithubNotConnectedError } from "@/lib/auth/github-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as { source: string; sid?: string };
  const source = body.source?.trim();
  if (!source) {
    return new Response(JSON.stringify({ error: "source required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sid = body.sid ?? newSessionId();

  let githubToken: string;
  try {
    githubToken = await getCurrentUserGithubToken();
  } catch (err) {
    if (err instanceof GithubNotConnectedError) {
      return new Response(JSON.stringify({ error: "github_not_connected", message: err.message }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }

  return sseResponse(async (ctrl) => {
    ctrl.send("session", { sid });

    let codebase;
    try {
      codebase = await runParserAgent(source, githubToken, (message, fileCount) => {
        ctrl.send("parse-progress", { message, fileCount });
      });
    } catch (err) {
      const code = err instanceof RepoNotAccessibleError ? "repo_not_accessible" : undefined;
      ctrl.send("error", {
        stage: "parse",
        code,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    ctrl.send("parsed", {
      repoName: codebase.repoName,
      totalFiles: codebase.totalFiles,
      techStack: codebase.techStack,
      filesRead: codebase.files.length,
    });

    await updateSession(sid, userId, (r) => ({ ...r, source, codebase }));

    if (!process.env.ANTHROPIC_API_KEY) {
      ctrl.send("error", {
        stage: "analyze",
        message: "ANTHROPIC_API_KEY not set; skipping Claude analysis.",
      });
      ctrl.send("done", { sid, hasAnalysis: false });
      return;
    }

    try {
      const analysis = await runAnalyzerAgent(codebase, (chunk) => {
        ctrl.send("chunk", { text: chunk });
      });
      await updateSession(sid, userId, (r) => ({ ...r, analysis }));
      ctrl.send("analysis", analysis);
      ctrl.send("done", { sid, hasAnalysis: true });
    } catch (err) {
      ctrl.send("error", {
        stage: "analyze",
        message: err instanceof Error ? err.message : String(err),
      });
      ctrl.send("done", { sid, hasAnalysis: false });
    }
  });
}
