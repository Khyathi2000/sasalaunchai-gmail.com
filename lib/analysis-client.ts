// Typed client for the Python analysis sidecar. Streams the SSE response
// back to the caller as a series of typed events.

import type { ParsedCodebase, AnalysisResult } from "./core.js";

export interface SpecialistReport {
  specialist:
    | "frontend"
    | "backend"
    | "api"
    | "database"
    | "storage"
    | "auth"
    | "jobs"
    | "ml"
    | "secrets"
    | "scaling"
    | "security";
  summary: string;
  findings: Array<{
    title: string;
    detail: string;
    files: string[];
    severity: "info" | "note" | "concern";
  }>;
  inferred_services: string[];
  confidence: number;
  raw?: string;
}

export interface RepoAnalysisPython {
  repo_name: string;
  summary: string;
  architecture_mermaid: string;
  specialists: SpecialistReport[];
  cross_cutting_concerns: Array<{
    title: string;
    detail: string;
    files: string[];
    severity: "info" | "note" | "concern";
  }>;
  infra_requirements: Record<string, unknown>;
  confidence: number;
  critic_passes: number;
}

export type AnalysisEvent =
  | { type: "state"; phase: string }
  | { type: "report"; report: SpecialistReport }
  | { type: "analysis"; analysis: RepoAnalysisPython }
  | { type: "error"; message: string }
  | { type: "done"; sid?: string; specialists: number; critic_passes: number };

export class AnalysisServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisServiceUnavailableError";
  }
}

const DEFAULT_URL = process.env.ANALYSIS_SERVICE_URL ?? "http://localhost:8001";

/**
 * POSTs to the sidecar /analyze endpoint and yields parsed SSE events.
 */
export async function* streamAnalysis(
  codebase: ParsedCodebase,
  opts?: { sid?: string; baseUrl?: string; signal?: AbortSignal },
): AsyncGenerator<AnalysisEvent, void, void> {
  const baseUrl = opts?.baseUrl ?? DEFAULT_URL;
  const url = `${baseUrl.replace(/\/$/, "")}/analyze`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ codebase, sid: opts?.sid }),
      signal: opts?.signal,
    });
  } catch (err) {
    throw new AnalysisServiceUnavailableError(
      `Could not reach analysis sidecar at ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AnalysisServiceUnavailableError(
      `Analysis sidecar returned ${resp.status}: ${text || resp.statusText}`,
    );
  }
  if (!resp.body) {
    throw new AnalysisServiceUnavailableError("Analysis sidecar returned empty body");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = parseEventBlock(block);
      if (ev) yield ev;
    }
  }
}

function parseEventBlock(block: string): AnalysisEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (!line) continue;
    if (line.startsWith(":")) continue; // sse comment / ping
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  const data = dataLines.join("\n");
  try {
    const parsed = JSON.parse(data);
    switch (event) {
      case "state":
        return { type: "state", phase: String(parsed.phase ?? "") };
      case "report":
        return { type: "report", report: parsed as SpecialistReport };
      case "analysis":
        return { type: "analysis", analysis: parsed as RepoAnalysisPython };
      case "error":
        return { type: "error", message: String(parsed.message ?? "unknown") };
      case "done":
        return {
          type: "done",
          sid: parsed.sid,
          specialists: Number(parsed.specialists ?? 0),
          critic_passes: Number(parsed.critic_passes ?? 0),
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Adapts the rich Python `RepoAnalysis` to the legacy `AnalysisResult`
 * shape the rest of the TS app expects. Keeps the existing inference /
 * planning code paths working while we roll out richer consumers.
 *
 * The Python schema is a superset; we project its fields onto the
 * narrower TS schema so `inferServices` and the rest of `src/core` keep
 * working. The full `RepoAnalysisPython` is also persisted on the session
 * (`analysisRich`) for richer UI consumption.
 */
export function adaptToLegacyAnalysisResult(p: RepoAnalysisPython): AnalysisResult {
  const fileExplanations: AnalysisResult["fileExplanations"] = p.specialists.flatMap((s) =>
    s.findings.flatMap((f) =>
      f.files.map((path) => ({
        path,
        role: s.specialist,
        explanation: `${f.title}: ${f.detail}`,
        keyExports: [],
        connects: [],
        patterns: [],
        complexity: "medium" as const,
      })),
    ),
  );

  const techConsiderations: AnalysisResult["techConsiderations"] = p.specialists
    .filter((s) => s.confidence > 0)
    .map((s) => ({
      name: s.specialist,
      purpose: s.summary,
      whyChosen: s.inferred_services.length
        ? `Recommended services: ${s.inferred_services.join(", ")}`
        : "Detected by specialist",
      alternative: undefined,
    }));

  return {
    repoName: p.repo_name,
    summary: p.summary,
    flowchart: p.architecture_mermaid,
    fileExplanations,
    techConsiderations,
    infraRequirements: pythonInfraToLegacy(p.infra_requirements as Record<string, unknown>),
    analyzedAt: new Date().toISOString(),
  };
}

function pythonInfraToLegacy(
  infra: Record<string, unknown>,
): AnalysisResult["infraRequirements"] {
  const runtimeStr = String(infra.runtime ?? "container");
  const runtimeType: "container" | "serverless" | "vm" =
    runtimeStr === "serverless" || runtimeStr === "vm" ? runtimeStr : "container";

  const databases =
    infra.needs_database && infra.database_engine
      ? [
          {
            type: "managed",
            engine: String(infra.database_engine),
            reason: "Detected by database specialist",
          },
        ]
      : [];

  const storage = infra.needs_object_storage
    ? [{ type: "object", reason: "Detected by storage specialist" }]
    : [];

  const messaging = infra.needs_message_queue
    ? [{ type: "queue", reason: "Detected by jobs specialist" }]
    : [];

  const caching = infra.needs_cache ? [{ type: "redis", reason: "Detected by scaling specialist" }] : [];

  const sensitiveVars: string[] = Array.isArray(infra.sensitive_env_vars)
    ? (infra.sensitive_env_vars as string[])
    : [];

  return {
    runtime: { type: runtimeType, reason: "Inferred by analysis crew" },
    databases,
    storage,
    messaging,
    caching,
    networking: {
      needsLoadBalancer: !!infra.has_long_running_requests || !!infra.has_websocket,
      needsCDN: false,
      needsVPN: false,
      reason: "Inferred by analysis crew",
    },
    auth: {
      type: infra.auth_provider ? "managed" : "none",
      provider: String(infra.auth_provider ?? "none"),
      reason: "Detected by auth specialist",
    },
    scaling: {
      min: Number(infra.scaling_min ?? 0),
      max: Number(infra.scaling_max ?? 10),
      metric: "concurrency",
      reason: "Inferred by scaling specialist",
    },
    envVars: sensitiveVars.map((key) => ({
      key,
      description: "Detected by secrets specialist",
      sensitive: true,
    })),
  };
}
