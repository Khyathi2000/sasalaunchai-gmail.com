import { NextResponse } from "next/server";
import { join } from "path";
import { readSession, updateSession, ensureSessionDir } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";
import { inferServices } from "@/lib/core";
import type { DeploymentPlan, ServiceRecommendation, ServiceSelection } from "@/lib/core";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as {
    sid: string;
    provider: "aws" | "gcp";
    region: string;
    selections: string[];
    applyMode?: boolean;
  };

  const session = await readSession(body.sid, userId);
  if (!session?.codebase) {
    return NextResponse.json(
      {
        error: "session_or_codebase_missing",
        message: "Session not found, or analyze step hasn't completed yet. Re-paste the repo URL and wait for analysis to finish before deploying.",
      },
      { status: 404 },
    );
  }

  // Recommendations may be missing if the user clicked deploy before
  // ServiceGrid's auto-infer fired (e.g. after re-analyzing from the
  // monitoring phase). Recover by running inference inline so the deploy
  // click "just works".
  let recommendations: ServiceRecommendation[] = session.recommendations ?? [];
  if (recommendations.length === 0) {
    recommendations = inferServices(session.codebase, session.analysis, body.provider);
    await updateSession(body.sid, userId, (r) => ({ ...r, recommendations }));
  }

  const selectedRecs = recommendations.filter((r) => body.selections.includes(r.serviceId));
  if (selectedRecs.length === 0) {
    return NextResponse.json(
      {
        error: "no_services_selected",
        message: `No selected services matched the recommendation list for ${body.provider}. Did you switch providers right before clicking deploy? Re-pick services and try again.`,
      },
      { status: 400 },
    );
  }

  const services: ServiceSelection[] = selectedRecs.map((r) => ({
    serviceId: r.serviceId,
    config: r.config,
  }));

  const sessionDir = ensureSessionDir(body.sid);
  const workDir = join(sessionDir, "deploy");

  const plan: DeploymentPlan = {
    source: session.source ?? session.codebase.repoUrl,
    provider: body.provider,
    region: body.region,
    services,
    workDir,
    applyMode: body.applyMode ?? false,
    infraRequirements: session.analysis?.infraRequirements,
  };

  const planId = `plan-${body.sid}`;
  await updateSession(body.sid, userId, (r) => ({ ...r, plan, planId }));

  return NextResponse.json({
    planId,
    plan,
    selectedServices: selectedRecs.map((r) => ({
      serviceId: r.serviceId,
      serviceName: r.serviceName,
      provider: r.provider,
    })),
  });
}
