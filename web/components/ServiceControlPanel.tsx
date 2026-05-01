"use client";

import { useState } from "react";
import { BracketButton } from "./BracketButton";
import { useStore } from "@/lib/store";
import { postEventStream } from "@/lib/sse";
import type { AgentMessage } from "@/lib/core";

export function ServiceControlPanel() {
  const sid = useStore((s) => s.sid);
  const recommendations = useStore((s) => s.recommendations);
  const selections = useStore((s) => s.selections);
  const lifecycle = useStore((s) => s.lifecycle);
  const setLifecycle = useStore((s) => s.setLifecycle);

  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  const services = recommendations.filter((r) => selections[r.serviceId]);

  const act = async (serviceId: string, action: "stop" | "start" | "destroy") => {
    if (!sid) return;
    setBusy(`${serviceId}:${action}`);
    setError(null);

    try {
      await postEventStream(`/api/services/${serviceId}/toggle`, { sid, action }, {
        message: (data) => {
          const m = data as AgentMessage;
          const msg = m.payload.message;
          if (m.type === "log" && msg) {
            setLogs((prev) => ({
              ...prev,
              [serviceId]: [...(prev[serviceId] ?? []), msg].slice(-50),
            }));
          }
        },
        result: (data) => {
          const r = data as { state: "running" | "stopped" | "destroyed"; success: boolean; error?: string };
          setLifecycle(serviceId, r.state);
          if (!r.success && r.error) setError(r.error);
        },
        error: (data) => {
          const d = data as { message?: string };
          if (d.message) setError(d.message);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border border-border">
      <header className="border-b border-border px-4 py-2 text-[0.65rem] uppercase tracking-wider">
        [ services ] · {services.length} deployed
      </header>
      {error && (
        <p className="border-b border-border px-4 py-2 text-xs text-err">[error] {error}</p>
      )}
      <ul className="divide-y divide-border">
        {services.map((rec) => {
          const state = lifecycle[rec.serviceId] ?? "running";
          const isBusy = busy?.startsWith(`${rec.serviceId}:`);
          const sLogs = logs[rec.serviceId];
          return (
            <li key={rec.serviceId} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs">
                    <span aria-hidden style={{ color: stateColor(state) }} className="mr-2">
                      {stateGlyph(state)}
                    </span>
                    {rec.serviceId}
                    <span className="ml-2 text-[0.65rem] uppercase text-muted-foreground">{state}</span>
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">{rec.serviceName}</div>
                </div>
                <div className="flex gap-2">
                  {state === "stopped" && (
                    <BracketButton onClick={() => act(rec.serviceId, "start")} loading={isBusy}>
                      start
                    </BracketButton>
                  )}
                  {state === "running" && (
                    <BracketButton onClick={() => act(rec.serviceId, "stop")} loading={isBusy}>
                      stop
                    </BracketButton>
                  )}
                  {state !== "destroyed" && (
                    <BracketButton variant="danger" onClick={() => act(rec.serviceId, "destroy")} loading={isBusy}>
                      destroy
                    </BracketButton>
                  )}
                </div>
              </div>
              {sLogs && sLogs.length > 0 && (
                <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap bg-ink/[0.02] px-2 py-1 text-[0.65rem] text-foreground/70">
                  {sLogs.join("\n")}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function stateGlyph(state: string): string {
  if (state === "running") return "●";
  if (state === "stopped") return "◌";
  if (state === "destroyed") return "×";
  return "○";
}

function stateColor(state: string): string {
  if (state === "running") return "hsl(var(--ok))";
  if (state === "stopped") return "hsl(var(--warn))";
  if (state === "destroyed") return "hsl(var(--muted))";
  return "hsl(var(--fg))";
}
