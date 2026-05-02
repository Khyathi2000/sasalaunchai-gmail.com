import { sseResponse } from "@/lib/sse-server";
import { getOrchestrator } from "@/lib/bus-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function GET(_req: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const orch = getOrchestrator(planId);

  return sseResponse(async (ctrl) => {
    if (!orch) {
      ctrl.send("error", { message: `No live orchestrator for ${planId}` });
      return;
    }

    ctrl.send("attached", { planId });

    const bus = orch.getBus();
    // Replay buffered messages
    for (const msg of bus.getMessages()) ctrl.send("message", msg);

    const onMessage = (m: unknown) => ctrl.send("message", m);
    bus.on("message", onMessage);

    await new Promise<void>((resolve) => {
      const heartbeat = setInterval(() => {
        if (!ctrl.isOpen()) {
          clearInterval(heartbeat);
          bus.off("message", onMessage);
          resolve();
        } else {
          ctrl.send("heartbeat", { t: Date.now() });
        }
      }, 30000);
    });
  });
}
