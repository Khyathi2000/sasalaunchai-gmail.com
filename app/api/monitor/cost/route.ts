import { sseResponse } from "@/lib/sse-server";
import { estimateCosts, fetchRealCosts } from "@/lib/core";
import { fetchGcpCosts } from "@core/monitoring/collectors/gcp-cost.js";
import { readSession } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function GET(req: Request) {
  const userId = await ensureUser();
  const { searchParams } = new URL(req.url);
  const sid = searchParams.get("sid");
  if (!sid) {
    return new Response("sid required", { status: 400 });
  }

  return sseResponse(async (ctrl, signal) => {
    const session = await readSession(sid, userId);
    if (!session?.plan) {
      ctrl.send("error", { message: "no plan in session" });
      return;
    }
    const provider = session.plan.provider as "aws" | "gcp";
    const serviceIds = session.plan.services.map((s) => s.serviceId);
    const region = session.plan.region;

    let tick = 0;
    while (ctrl.isOpen() && !signal.aborted) {
      const estimate = estimateCosts(serviceIds);
      ctrl.send("estimate", estimate);

      // Real costs every 5 minutes (rate-limited by underlying APIs).
      if (tick % 10 === 0) {
        try {
          const real =
            provider === "gcp" ? await fetchGcpCosts(region) : await fetchRealCosts(region);
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
