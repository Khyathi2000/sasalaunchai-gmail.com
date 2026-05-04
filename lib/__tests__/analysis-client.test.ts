import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  adaptToLegacyAnalysisResult,
  streamAnalysis,
  AnalysisServiceUnavailableError,
  type AnalysisEvent,
  type RepoAnalysisPython,
} from "../analysis-client.js";

describe("analysis-client", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.ANALYSIS_SERVICE_URL = "http://stub";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.ANALYSIS_SERVICE_URL;
  });

  it("parses a multi-event SSE stream", async () => {
    const sse =
      `event: state\ndata: ${JSON.stringify({ phase: "ingesting" })}\n\n` +
      `event: report\ndata: ${JSON.stringify({
        specialist: "frontend",
        summary: "x",
        findings: [],
        inferred_services: [],
        confidence: 0.5,
      })}\n\n` +
      `event: analysis\ndata: ${JSON.stringify({
        repo_name: "demo",
        summary: "y",
        architecture_mermaid: "flowchart TD\n  A-->B",
        specialists: [],
        cross_cutting_concerns: [],
        infra_requirements: { runtime: "container", needs_database: true },
        confidence: 0.8,
        critic_passes: 1,
      })}\n\n` +
      `event: done\ndata: ${JSON.stringify({ sid: "s1", specialists: 11, critic_passes: 1 })}\n\n`;

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const events: AnalysisEvent[] = [];
    for await (const ev of streamAnalysis(
      { repoName: "demo", files: [], techStack: [], fileTree: [], totalFiles: 0 } as never,
      { sid: "s1" },
    )) {
      events.push(ev);
    }

    expect(events.map((e) => e.type)).toEqual(["state", "report", "analysis", "done"]);
    expect((events[1] as { report: { specialist: string } }).report.specialist).toBe("frontend");
    expect((events[2] as { analysis: { repo_name: string } }).analysis.repo_name).toBe("demo");
  });

  it("throws AnalysisServiceUnavailableError on connection failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const gen = streamAnalysis({ repoName: "x", files: [], techStack: [], fileTree: [], totalFiles: 0 } as never);
    await expect(gen.next()).rejects.toBeInstanceOf(AnalysisServiceUnavailableError);
  });

  it("throws on non-2xx response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const gen = streamAnalysis({ repoName: "x", files: [], techStack: [], fileTree: [], totalFiles: 0 } as never);
    await expect(gen.next()).rejects.toThrow(/500/);
  });

  it("adaptToLegacyAnalysisResult flattens specialist findings", () => {
    const py: RepoAnalysisPython = {
      repo_name: "demo",
      summary: "summary",
      architecture_mermaid: "flowchart TD\n  A-->B",
      specialists: [
        {
          specialist: "frontend",
          summary: "is nextjs",
          findings: [
            { title: "ssr", detail: "uses ssr", files: ["app/page.tsx"], severity: "info" },
          ],
          inferred_services: ["cloud-run"],
          confidence: 0.9,
        },
        {
          specialist: "database",
          summary: "uses prisma",
          findings: [
            { title: "prisma", detail: "schema present", files: ["prisma/schema.prisma"], severity: "info" },
          ],
          inferred_services: ["cloud-sql"],
          confidence: 0.95,
        },
      ],
      cross_cutting_concerns: [],
      infra_requirements: {
        runtime: "container",
        needs_database: true,
        database_engine: "postgres",
        needs_object_storage: false,
        needs_cache: false,
        needs_message_queue: false,
        needs_background_workers: false,
        needs_ml_inference: false,
        needs_ml_training: false,
        has_websocket: false,
        has_long_running_requests: false,
        auth_provider: "clerk",
        estimated_qps: null,
        scaling_min: 1,
        scaling_max: 10,
        sensitive_env_vars: ["DATABASE_URL"],
      },
      confidence: 0.9,
      critic_passes: 1,
    };
    const legacy = adaptToLegacyAnalysisResult(py);
    expect(legacy.summary).toBe("summary");
    expect(legacy.flowchart.startsWith("flowchart TD")).toBe(true);
    expect(legacy.repoName).toBe("demo");
    expect(legacy.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(legacy.fileExplanations).toHaveLength(2);
    expect(legacy.techConsiderations.map((t) => t.name).sort()).toEqual(["database", "frontend"]);
    expect(legacy.infraRequirements!.runtime.type).toBe("container");
    expect(legacy.infraRequirements!.databases).toEqual([
      { type: "managed", engine: "postgres", reason: "Detected by database specialist" },
    ]);
    expect(legacy.infraRequirements!.auth.provider).toBe("clerk");
    expect(legacy.infraRequirements!.scaling.min).toBe(1);
    expect(legacy.infraRequirements!.scaling.max).toBe(10);
    expect(legacy.infraRequirements!.envVars).toEqual([
      { key: "DATABASE_URL", description: "Detected by secrets specialist", sensitive: true },
    ]);
  });
});
