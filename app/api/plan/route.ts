import { NextResponse } from "next/server";
import { join } from "path";
import { readSession, updateSession, ensureSessionDir } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";
import type { DeploymentPlan, ServiceSelection } from "@/lib/core";

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
