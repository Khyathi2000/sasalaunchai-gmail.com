import { NextResponse } from "next/server";
import { join } from "path";
import { readSession, updateSession, ensureSessionDir } from "@/lib/sessions";
import type { DeploymentPlan, ServiceSelection } from "@/lib/core";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    sid: string;
    provider: "aws" | "gcp";
    region: string;
    selections: string[];
    applyMode?: boolean;
  };

  const session = readSession(body.sid);
  if (!session?.codebase || !session.recommendations) {
    return NextResponse.json({ error: "session/inference missing" }, { status: 404 });
  }

  const selectedRecs = session.recommendations.filter((r) =>
    body.selections.includes(r.serviceId),
  );

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
  updateSession(body.sid, (r) => ({ ...r, plan, planId }));

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
