import { runParserAgent, runAnalyzerAgent, RepoNotAccessibleError } from "@/lib/core";
import { sseResponse } from "@/lib/sse-server";
import { newSessionId, updateSession } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";
import { getCurrentUserGithubToken, GithubNotConnectedError } from "@/lib/auth/github-token";
import {
  AnalysisServiceUnavailableError,
  adaptToLegacyAnalysisResult,
  streamAnalysis,
  type RepoAnalysisPython,
} from "@/lib/analysis-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as { source: string; sid?: string; engine?: "sidecar" | "legacy" };
  const source = body.source?.trim();
  if (!source) {
    return new Response(JSON.stringify({ error: "source required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sid = body.sid ?? newSessionId();
  const engine =
    body.engine ??
    (process.env.ANALYSIS_SERVICE_URL || process.env.NEXT_PUBLIC_ANALYSIS_SERVICE_URL
      ? "sidecar"
      : "legacy");

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

    if (engine === "sidecar") {
      try {
        const richAnalysis = await runSidecarAnalysis(codebase, sid, ctrl);
        const adapted = adaptToLegacyAnalysisResult(richAnalysis);
        await updateSession(sid, userId, (r) => ({
          ...r,
          analysis: adapted,
          analysisRich: richAnalysis as never,
        }));
        ctrl.send("analysis", adapted);
        ctrl.send("done", { sid, hasAnalysis: true, engine: "sidecar" });
        return;
      } catch (err) {
        if (err instanceof AnalysisServiceUnavailableError) {
          ctrl.send("error", {
            stage: "analyze",
            message: `${err.message} — falling back to legacy single-call analyzer`,
          });
          // Fall through to legacy path.
        } else {
          ctrl.send("error", {
            stage: "analyze",
            message: err instanceof Error ? err.message : String(err),
          });
          ctrl.send("done", { sid, hasAnalysis: false, engine: "sidecar" });
          return;
        }
      }
    }

    // Legacy single-Claude-call path (original behavior).
    if (!process.env.ANTHROPIC_API_KEY) {
      ctrl.send("error", {
        stage: "analyze",
        message: "ANTHROPIC_API_KEY not set; skipping Claude analysis.",
      });
      ctrl.send("done", { sid, hasAnalysis: false, engine: "legacy" });
      return;
    }

    try {
      const analysis = await runAnalyzerAgent(codebase, (chunk) => {
        ctrl.send("chunk", { text: chunk });
      });
      await updateSession(sid, userId, (r) => ({ ...r, analysis }));
      ctrl.send("analysis", analysis);
      ctrl.send("done", { sid, hasAnalysis: true, engine: "legacy" });
    } catch (err) {
      ctrl.send("error", {
        stage: "analyze",
        message: err instanceof Error ? err.message : String(err),
      });
      ctrl.send("done", { sid, hasAnalysis: false, engine: "legacy" });
    }
  });
}

async function runSidecarAnalysis(
  codebase: Awaited<ReturnType<typeof runParserAgent>>,
  sid: string,
  ctrl: { send: (event: string, data: unknown) => void },
): Promise<RepoAnalysisPython> {
  let final: RepoAnalysisPython | null = null;
  let lastError: string | null = null;
  for await (const ev of streamAnalysis(codebase, { sid })) {
    if (ev.type === "state") ctrl.send("analysis-phase", { phase: ev.phase });
    else if (ev.type === "report") ctrl.send("specialist", ev.report);
    else if (ev.type === "analysis") final = ev.analysis;
    else if (ev.type === "error") lastError = ev.message;
    else if (ev.type === "done") ctrl.send("analysis-done", ev);
  }
  if (!final) {
    throw new Error(lastError ?? "sidecar finished without an analysis event");
  }
  return final;
}
