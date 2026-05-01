"use client";

import { useState } from "react";
import { BracketButton } from "./BracketButton";
import { useStore } from "@/lib/store";
import { postEventStream } from "@/lib/sse";

export function MigrateButton() {
  const sid = useStore((s) => s.sid);
  const provider = useStore((s) => s.provider);
  const setProvider = useStore((s) => s.setProvider);
  const setRegion = useStore((s) => s.setRegion);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"aws" | "gcp">(provider === "aws" ? "gcp" : "aws");
  const [region, setRegion_] = useState(provider === "aws" ? "us-central1" : "us-east-1");
  const [decommission, setDecommission] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!sid) return;
    setRunning(true);
    setError(null);
    setLogs([]);

    try {
      await postEventStream(
        "/api/migrate",
        { sid, targetProvider: target, targetRegion: region, decommissionSource: decommission },
        {
          target: (data) => {
            const m = data as { type?: string; payload?: { message?: string } };
            if (m.type === "log" && m.payload?.message) {
              setLogs((prev) => [...prev, `[target] ${m.payload!.message}`].slice(-100));
            }
          },
          "migration-status": (data) => {
            const m = data as { type?: string; payload?: { message?: string } };
            if (m.payload?.message) {
              setLogs((prev) => [...prev, `[migration] ${m.payload!.message}`].slice(-100));
            }
          },
          done: (data) => {
            const status = data as { phase?: string };
            setLogs((prev) => [...prev, `[migration] phase: ${status.phase}`]);
            if (status.phase === "complete" || status.phase === "target-running") {
              setProvider(target);
              setRegion(region);
            }
          },
          error: (data) => {
            const d = data as { message?: string };
            setError(d.message ?? "migration error");
          },
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-[0.65rem] uppercase tracking-wider">[ migrate ]</span>
        <BracketButton onClick={() => setOpen((o) => !o)}>
          {open ? "close" : "open"}
        </BracketButton>
      </header>

      {open && (
        <div className="space-y-3 px-4 py-3 text-xs">
          <p className="text-muted-foreground">
            deploys to a second provider in parallel. source stays running until you decommission it.
          </p>

          <div className="flex gap-2">
            {(["aws", "gcp"] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setTarget(p);
                  setRegion_(p === "aws" ? "us-east-1" : "us-central1");
                }}
                disabled={p === provider}
                className={
                  "px-3 py-1.5 uppercase tracking-wider " +
                  (target === p ? "bg-ink text-cream" : "border border-ink hover:bg-ink/[0.05]") +
                  (p === provider ? " opacity-30 cursor-not-allowed" : "")
                }
              >
                [{target === p ? "X" : " "}] {p}
              </button>
            ))}
          </div>

          <input
            value={region}
            onChange={(e) => setRegion_(e.target.value)}
            placeholder="target region"
            className="w-full border border-ink bg-transparent px-2 py-1 focus:outline-none"
          />

          <button
            onClick={() => setDecommission(!decommission)}
            className="flex items-center gap-2 uppercase tracking-wider"
          >
            <span className="font-mono">[{decommission ? "X" : " "}]</span>
            <span>decommission source after target ready</span>
          </button>

          <BracketButton variant="primary" onClick={start} loading={running} disabled={!sid}>
            start migration
          </BracketButton>

          {logs.length > 0 && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap bg-ink/[0.02] px-2 py-2 text-[0.65rem]">
              {logs.join("\n")}
            </pre>
          )}
          {error && <p className="text-err">[error] {error}</p>}
        </div>
      )}
    </div>
  );
}
