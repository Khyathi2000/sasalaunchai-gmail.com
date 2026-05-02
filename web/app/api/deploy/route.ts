import { DeploymentOrchestrator } from "@/lib/core";
import { sseResponse } from "@/lib/sse-server";
import { readSession } from "@/lib/sessions";
import { registerOrchestrator } from "@/lib/bus-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function POST(req: Request) {
  const { sid } = (await req.json()) as { sid: string };
  const session = await readSession(sid);
  if (!session?.plan || !session.recommendations || !session.planId) {
    return new Response(JSON.stringify({ error: "no plan in session" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const planId = session.planId;
  const selectedServiceIds = new Set(session.plan.services.map((s) => s.serviceId));
  const recs = session.recommendations.filter((r) => selectedServiceIds.has(r.serviceId));

  const orch = new DeploymentOrchestrator(session.plan, recs);
  registerOrchestrator(planId, orch);

  return sseResponse(async (ctrl) => {
    ctrl.send("planId", { planId });

    const bus = orch.getBus();
    const onMessage = (m: unknown) => {
      ctrl.send("message", m);
    };
    bus.on("message", onMessage);

    try {
      const result = await orch.execute();
      ctrl.send("result", result);
    } catch (err) {
      ctrl.send("error", {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      bus.off("message", onMessage);
      ctrl.send("done", { planId });
    }
  });
}
