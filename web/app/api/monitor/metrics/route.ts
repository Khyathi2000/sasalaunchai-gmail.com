import { sseResponse } from "@/lib/sse-server";
import { collectMetrics } from "@/lib/core";
import { readSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sid = searchParams.get("sid");
  if (!sid) return new Response("sid required", { status: 400 });

  return sseResponse(async (ctrl, signal) => {
    const session = readSession(sid);
    if (!session?.plan) {
      ctrl.send("error", { message: "no plan in session" });
      return;
    }
    const serviceIds = session.plan.services.map((s) => s.serviceId);
    const region = session.plan.region;

    while (ctrl.isOpen() && !signal.aborted) {
      const results = await Promise.all(
        serviceIds.map((id) => collectMetrics(id, region).catch(() => null)),
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
