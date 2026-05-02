import { sseResponse } from "@/lib/sse-server";
import { estimateCosts, fetchRealCosts } from "@/lib/core";
import { readSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sid = searchParams.get("sid");
  if (!sid) {
    return new Response("sid required", { status: 400 });
  }

  return sseResponse(async (ctrl, signal) => {
    const session = await readSession(sid);
    if (!session?.plan) {
      ctrl.send("error", { message: "no plan in session" });
      return;
    }
    const serviceIds = session.plan.services.map((s) => s.serviceId);
    const region = session.plan.region;

    let tick = 0;
    while (ctrl.isOpen() && !signal.aborted) {
      const estimate = estimateCosts(serviceIds);
      ctrl.send("estimate", estimate);

      // Real costs only every 5 minutes (Cost Explorer API limits)
      if (tick % 10 === 0) {
        try {
          const real = await fetchRealCosts(region);
          if (real) ctrl.send("real", real);
        } catch {
          // ignore — fall back to estimates
        }
      }

      tick++;
      await sleep(30_000, signal);
    }
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}
