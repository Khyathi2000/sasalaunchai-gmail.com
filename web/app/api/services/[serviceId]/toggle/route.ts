import { sseResponse } from "@/lib/sse-server";
import { getOrchestrator } from "@/lib/bus-registry";
import { readSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;
  const body = (await req.json()) as {
    sid: string;
    action: "stop" | "start" | "destroy";
  };
  const session = await readSession(body.sid);
  if (!session?.planId) {
    return new Response(JSON.stringify({ error: "no planId" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const orch = getOrchestrator(session.planId);
  if (!orch) {
    return new Response(JSON.stringify({ error: "orchestrator not running; redeploy to control" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  return sseResponse(async (ctrl) => {
    const bus = orch.getBus();
    const onMessage = (m: unknown) => ctrl.send("message", m);
    bus.on("message", onMessage);

    try {
      let result;
      if (body.action === "destroy") result = await orch.destroyService(serviceId);
      else if (body.action === "stop") result = await orch.stopService(serviceId);
      else result = await orch.startService(serviceId);
      ctrl.send("result", result);
    } catch (err) {
      ctrl.send("error", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      bus.off("message", onMessage);
      ctrl.send("done", { serviceId });
    }
  });
}
