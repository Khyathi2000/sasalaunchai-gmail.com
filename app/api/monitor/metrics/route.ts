import { sseResponse } from "@/lib/sse-server";
import { collectMetrics } from "@/lib/core";
import { collectGcpMetrics } from "@core/monitoring/collectors/gcp-metrics.js";
import { readSession } from "@/lib/sessions";
import { ensureUser } from "@/lib/auth/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function GET(req: Request) {
  const userId = await ensureUser();
  const { searchParams } = new URL(req.url);
  const sid = searchParams.get("sid");
  if (!sid) return new Response("sid required", { status: 400 });

  return sseResponse(async (ctrl, signal) => {
    const session = await readSession(sid, userId);
    if (!session?.plan) {
      ctrl.send("error", { message: "no plan in session" });
      return;
    }
    const provider = session.plan.provider as "aws" | "gcp";
    const serviceIds = session.plan.services.map((s) => s.serviceId);
    const region = session.plan.region;

    while (ctrl.isOpen() && !signal.aborted) {
      const results = await Promise.all(
        serviceIds.map(async (id) => {
          try {
            if (provider === "gcp") {
              const m = await collectGcpMetrics(id);
              if (m) return m;
            }
            return await collectMetrics(id, region);
          } catch {
            return null;
          }
        }),
      );
      for (const m of results) {
        if (m) ctrl.send("metrics", m);
      }
      await sleep(15_000, signal);
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
