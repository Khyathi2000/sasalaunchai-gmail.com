"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { postEventStream } from "@/lib/sse";
import { BracketButton } from "./BracketButton";
import type { AgentMessage } from "@/lib/core";

interface AgentRow {
  agentId: string;
  status: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
  logs: string[];
  error?: string;
  expanded: boolean;
}

const STATUS_GLYPH: Record<string, string> = {
  idle: "○", provisioning: "◐", configuring: "◐", deploying: "◐",
  validating: "◑", done: "●", error: "×", "rolling-back": "↶",
};

export function DeployTimeline() {
  const phase = useStore((s) => s.phase);
  const sid = useStore((s) => s.sid);
  const setPhase = useStore((s) => s.setPhase);
  const setPlanId = useStore((s) => s.setPlanId);
  const upsertAgent = useStore((s) => s.upsertAgent);

  const [rows, setRows] = useState<Record<string, AgentRow>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (phase !== "deploying" || !sid || startedRef.current) return;
    startedRef.current = true;
    setRunning(true);

    postEventStream("/api/deploy", { sid }, {
      planId: (data) => {
        const d = data as { planId: string };
        setPlanId(d.planId);
      },
      message: (data) => {
        const m = data as AgentMessage;
        setRows((prev) => upsert(prev, m));
        setOrder((prev) => (prev.includes(m.from) ? prev : [...prev, m.from]));
        upsertAgent({
          agentId: m.from,
          serviceId: m.from.replace(/-agent$/, ""),
          status: m.payload.status ?? "idle",
          message: m.payload.message,
          error: m.payload.error,
        });
      },
      result: () => {
        setDone(true);
      },
      error: (data) => {
        const d = data as { message?: string };
        setError(d.message ?? "deploy error");
      },
      done: () => {
        setRunning(false);
      },
    }).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    });
  }, [phase, sid, setPlanId, upsertAgent]);

  if (phase !== "deploying" && phase !== "monitoring") return null;

  return (
    <section className="mx-auto w-full max-w-screen-2xl px-8 pb-24 xl:px-16">
      <header className="mb-4 flex items-center justify-between">
        <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          [ step 04 / deploy ]
        </p>
        {done && phase !== "monitoring" && (
          <BracketButton variant="primary" onClick={() => setPhase("monitoring")}>
            view dashboard →
          </BracketButton>
        )}
      </header>

      <div className="border border-border">
        <div className="border-b border-border px-4 py-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {running && (
            <span>
              orchestrator running... <span className="caret"></span>
            </span>
          )}
          {done && !error && <span style={{ color: "hsl(var(--ok))" }}>● deployment complete</span>}
          {error && <span className="text-err">× {error}</span>}
        </div>

        <ul className="divide-y divide-border">
          {order.map((agentId) => {
            const row = rows[agentId];
            if (!row) return null;
            return (
              <li key={agentId}>
                <button
                  onClick={() =>
                    setRows((prev) => ({
                      ...prev,
                      [agentId]: { ...row, expanded: !row.expanded },
                    }))
                  }
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-xs hover:bg-ink/[0.03]"
                >
                  <span className="flex items-center gap-3">
                    <span aria-hidden style={{ color: glyphColor(row.status) }}>
                      {STATUS_GLYPH[row.status] ?? "○"}
                    </span>
                    <span>{agentId}</span>
                    {row.message && (
                      <span className="text-muted-foreground">— {row.message}</span>
                    )}
                  </span>
                  <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    {row.status}
                  </span>
                </button>
                {row.expanded && (
                  <div className="bg-ink/[0.02] px-4 py-2">
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[0.65rem] text-foreground/80">
                      {row.logs.join("\n") || "(no logs yet)"}
                      {row.error && (
                        <span className="text-err">{"\n[error] "}{row.error}</span>
                      )}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function upsert(prev: Record<string, AgentRow>, m: AgentMessage): Record<string, AgentRow> {
  const existing = prev[m.from] ?? {
    agentId: m.from,
    status: "idle",
    logs: [],
    expanded: false,
  };
  let next = { ...existing };
  if (m.type === "status" && m.payload.status) {
    next.status = m.payload.status;
    if (m.payload.message) next.message = m.payload.message;
    if (m.payload.status === "done" || m.payload.status === "error") {
      next.completedAt = m.timestamp;
    } else if (!next.startedAt) {
      next.startedAt = m.timestamp;
    }
  } else if (m.type === "log" && m.payload.message) {
    next = { ...next, logs: [...next.logs, m.payload.message].slice(-200) };
  } else if (m.type === "error" && m.payload.error) {
    next = { ...next, status: "error", error: m.payload.error };
  }
  return { ...prev, [m.from]: next };
}

function glyphColor(status: string): string {
  if (status === "done") return "hsl(var(--ok))";
  if (status === "error") return "hsl(var(--err))";
  if (status === "rolling-back") return "hsl(var(--warn))";
  return "hsl(var(--fg))";
}
