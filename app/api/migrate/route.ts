import { join } from "path";
import {
  inferServices,
  MigrationOrchestrator,
} from "@/lib/core";
import { sseResponse } from "@/lib/sse-server";
import { readSession, updateSession, ensureSessionDir } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";
import { hydrateAllFromVault } from "@/lib/credential-store";
import { getOrchestrator, registerMigration, registerOrchestrator } from "@/lib/bus-registry";
import type { DeploymentPlan } from "@/lib/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function POST(req: Request) {
  const userId = await ensureUser();
  const body = (await req.json()) as {
    sid: string;
    targetProvider: "aws" | "gcp";
    targetRegion: string;
    decommissionSource?: boolean;
  };

  const session = await readSession(body.sid, userId);
  if (!session?.codebase || !session.planId) {
    return new Response(JSON.stringify({ error: "no source deployment in session" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  await hydrateAllFromVault(userId);

  const sourceOrch = getOrchestrator(session.planId);
  if (!sourceOrch) {
    return new Response(JSON.stringify({ error: "source orchestrator not live; redeploy first" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targetRecs = inferServices(session.codebase, session.analysis, body.targetProvider);
  const sessionDir = ensureSessionDir(body.sid);
  const targetWorkDir = join(sessionDir, `migrate-${body.targetProvider}`);

  const targetPlan: DeploymentPlan = {
    source: session.source ?? session.codebase.repoUrl,
    provider: body.targetProvider,
    region: body.targetRegion,
    services: targetRecs.map((r) => ({ serviceId: r.serviceId, config: r.config })),
    workDir: targetWorkDir,
    applyMode: session.plan?.applyMode ?? false,
    infraRequirements: session.analysis?.infraRequirements,
  };

  const migration = new MigrationOrchestrator(sourceOrch, targetPlan, targetRecs);
  const migrationId = `migration-${body.sid}`;
  registerMigration(migrationId, migration);

  const targetPlanId = `${session.planId}-target-${body.targetProvider}`;
  registerOrchestrator(targetPlanId, migration.getTarget());
  await updateSession(body.sid, userId, (r) => ({
    ...r,
    plan: targetPlan,
    planId: targetPlanId,
  }));

  return sseResponse(async (ctrl) => {
    ctrl.send("migration", {
      migrationId,
      targetPlanId,
      status: migration.getStatus(),
    });

    const targetBus = migration.getTargetBus();
    const onTargetMessage = (m: unknown) => ctrl.send("target", m);
    targetBus.on("message", onTargetMessage);

    const migBus = migration.getBus();
    const onMigMessage = (m: unknown) => ctrl.send("migration-status", m);
    migBus.on("message", onMigMessage);

    try {
      await migration.startTarget();
      ctrl.send("target-running", migration.getStatus());

      if (body.decommissionSource) {
        const teardownResults = await migration.decommissionSource();
        ctrl.send("decommissioned", teardownResults);
      }
    } catch (err) {
      ctrl.send("error", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      targetBus.off("message", onTargetMessage);
      migBus.off("message", onMigMessage);
      ctrl.send("done", migration.getStatus());
    }
  });
}
