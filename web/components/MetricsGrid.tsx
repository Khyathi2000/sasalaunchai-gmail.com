"use client";

import { useStore } from "@/lib/store";
import { useEventStream } from "@/lib/sse";
import type { ServiceMetrics } from "@/lib/core";

export function MetricsGrid() {
  const sid = useStore((s) => s.sid);
  const metrics = useStore((s) => s.metrics);
  const setMetrics = useStore((s) => s.setMetrics);

  useEventStream(sid ? `/api/monitor/metrics?sid=${sid}` : null, {
    metrics: (data) => {
      const m = data as ServiceMetrics;
      setMetrics(m.serviceId, m);
    },
  }, [sid]);

  const entries = Object.values(metrics);

  return (
    <div className="border border-border">
      <header className="border-b border-border px-4 py-2 text-[0.65rem] uppercase tracking-wider">
        [ metrics ]
      </header>
      {entries.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          collecting... <span className="caret"></span>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((m) => (
            <li key={m.serviceId} className="px-4 py-3">
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span>{m.serviceId}</span>
                <span className="text-[0.65rem] uppercase text-muted-foreground">
                  {new Date(m.collectedAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.65rem] text-foreground/80 md:grid-cols-3">
                <Stat label="cpu" value={m.cpu} unit="%" />
                <Stat label="mem" value={m.memory} unit="%" />
                <Stat label="req" value={m.requestCount} unit="" />
                <Stat label="err" value={m.errorRate} unit="%" />
                <Stat label="p50" value={m.latencyP50} unit="ms" />
                <Stat label="p99" value={m.latencyP99} unit="ms" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value?: number; unit: string }) {
  return (
    <div className="flex justify-between">
      <span className="uppercase text-muted-foreground">{label}</span>
      <span>{value != null ? value.toFixed(1) + unit : "—"}</span>
    </div>
  );
}
