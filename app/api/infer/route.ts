import { NextResponse } from "next/server";
import { inferServices, refineRecommendations } from "@/lib/core";
import { readSession, updateSession } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";
import {
  buildArchitectureMermaid,
  buildCicdMermaid,
  buildDeploymentFlowMermaid,
} from "@core/inference/diagram-builders.js";
import { estimateProviderCost } from "@core/inference/cost-catalog.js";
import type { ServiceRecommendation } from "@core/types/cloud.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as {
    sid: string;
    /** When omitted, returns recommendations for BOTH clouds. */
    provider?: "aws" | "gcp";
    region?: string;
    refine?: boolean;
  };
  const session = await readSession(body.sid, userId);
  if (!session?.codebase) {
    return NextResponse.json({ error: "session/codebase missing" }, { status: 404 });
  }

  const providers: Array<"aws" | "gcp"> = body.provider ? [body.provider] : ["aws", "gcp"];

  const hasDockerfile = session.codebase.files.some((f) =>
    /(^|\/)Dockerfile$/.test(f.path),
  );
  const hasGithubActions = session.codebase.files.some((f) =>
    f.path.startsWith(".github/workflows/"),
  );

  const result: Record<string, unknown> = {};
  for (const provider of providers) {
    let recommendations = inferServices(session.codebase, session.analysis, provider);
    if (body.refine && process.env.ANTHROPIC_API_KEY) {
      try {
        recommendations = await refineRecommendations(
          recommendations,
          session.codebase,
          session.analysis,
        );
      } catch {
        // best-effort
      }
    }
    result[provider] = buildProviderBundle(recommendations, { hasDockerfile, hasGithubActions });
  }

  // Persist a default provider's recommendations so the existing /api/plan
  // route works without changes. Pick the higher-fitness provider when we
  // ran both; default to user's choice otherwise.
  const persistFor: "aws" | "gcp" = body.provider ?? pickPreferred(result);
  const persistRecs = (result[persistFor] as ProviderBundle).recommendations;
  await updateSession(body.sid, userId, (r) => ({ ...r, recommendations: persistRecs }));

  return NextResponse.json({
    providers,
    preferred: persistFor,
    ...result,
    // Backwards-compat: legacy key used by the existing UI.
    recommendations: persistRecs,
  });
}

interface ProviderBundle {
  provider: string;
  recommendations: ServiceRecommendation[];
  diagrams: { architecture: string; cicd: string; deployment: string };
  cost: ReturnType<typeof estimateProviderCost>;
  fitness: number;
  byCategory: Record<string, ServiceRecommendation[]>;
}

function buildProviderBundle(
  recs: ServiceRecommendation[],
  ctx: { hasDockerfile: boolean; hasGithubActions: boolean },
): ProviderBundle {
  const byCategory: Record<string, ServiceRecommendation[]> = {};
  for (const r of recs) {
    (byCategory[r.category] ??= []).push(r);
  }
  return {
    provider: recs[0]?.provider ?? "",
    recommendations: recs,
    diagrams: {
      architecture: buildArchitectureMermaid(recs),
      cicd: buildCicdMermaid(recs, ctx),
      deployment: buildDeploymentFlowMermaid(recs),
    },
    cost: estimateProviderCost(recs.map((r) => r.serviceId)),
    fitness: scoreFitness(recs),
    byCategory,
  };
}

/** Heuristic 0-1 fitness: coverage breadth + average confidence. */
function scoreFitness(recs: ServiceRecommendation[]): number {
  if (recs.length === 0) return 0;
  const categories = new Set(recs.map((r) => r.category));
  const coverage = Math.min(categories.size / 8, 1.0);
  const conf = recs.reduce((a, r) => a + confWeight(r.confidence), 0) / recs.length;
  return Math.round((0.5 * coverage + 0.5 * conf) * 100) / 100;
}

function confWeight(c: "high" | "medium" | "low"): number {
  return c === "high" ? 1.0 : c === "medium" ? 0.7 : 0.4;
}

function pickPreferred(result: Record<string, unknown>): "aws" | "gcp" {
  const aws = result["aws"] as ProviderBundle | undefined;
  const gcp = result["gcp"] as ProviderBundle | undefined;
  if (!aws) return "gcp";
  if (!gcp) return "aws";
  return aws.fitness >= gcp.fitness ? "aws" : "gcp";
}
