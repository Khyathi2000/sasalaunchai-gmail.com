"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { BracketButton } from "./BracketButton";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  mutations?: Array<{ tool: string; rationale: string; after: { length: number } | unknown[] }>;
  ts: string;
}

/**
 * Persistent right-side architect chat. Sends the user's prompt to
 * /api/architect, applies the returned mutations to the local store,
 * and shows a per-turn diff badge.
 */
export function ArchitectChat() {
  const sid = useStore((s) => s.sid);
  const recommendations = useStore((s) => s.recommendations);
  const setRecommendations = useStore((s) => s.setRecommendations);
  const setProvider = useStore((s) => s.setProvider);
  const setRegion = useStore((s) => s.setRegion);

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  const send = async () => {
    if (!sid || !draft.trim() || busy) return;
    const message = draft.trim();
    setDraft("");
    setError(null);
    const ts = new Date().toISOString();
    setTurns((t) => [...t, { role: "user", content: message, ts }]);
    setBusy(true);
    try {
      const res = await fetch("/api/architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid, message }),
      });
      if (!res.ok) {
        const { error: e } = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        throw new Error(e ?? `architect error ${res.status}`);
      }
      const data = (await res.json()) as {
        reply: string;
        mutations: Array<{ tool: string; rationale: string; after: unknown[] }>;
        state: {
          provider: "aws" | "gcp";
          region: string;
          recommendations: typeof recommendations;
        };
      };
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: data.reply,
          mutations: data.mutations.map((m) => ({
            tool: m.tool,
            rationale: m.rationale,
            after: m.after,
          })),
          ts: new Date().toISOString(),
        },
      ]);
      setRecommendations(data.state.recommendations);
      setProvider(data.state.provider);
      setRegion(data.state.region);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!sid) return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="toggle architect chat"
        className="fixed right-4 top-20 z-30 border border-ink bg-cream px-3 py-1.5 text-[0.65rem] uppercase tracking-wider hover:bg-ink hover:text-cream"
      >
        [ {open ? "close" : "architect"} ]
      </button>
      {open && (
        <aside className="fixed right-0 top-0 z-20 flex h-full w-full max-w-md flex-col border-l border-border bg-cream pt-16">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-[0.65rem] uppercase tracking-wider">[ architect ]</h2>
            <p className="mt-1 text-[0.65rem] text-muted-foreground">
              prompt to mutate the architecture. e.g. "add redis cache", "swap ecs for app runner",
              "switch to gcp".
            </p>
          </header>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 text-xs">
            {turns.length === 0 && (
              <p className="text-[0.65rem] text-muted-foreground">no messages yet.</p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={i > 0 ? "mt-4" : ""}>
                <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  [{t.role}] {new Date(t.ts).toLocaleTimeString()}
                </div>
                <div className="mt-1 whitespace-pre-wrap font-mono">{t.content}</div>
                {t.mutations && t.mutations.length > 0 && (
                  <ul className="mt-2 space-y-1 border border-border bg-ink/[0.03] p-2 text-[0.65rem]">
                    {t.mutations.map((m, j) => (
                      <li key={j}>
                        <span className="font-mono">{m.tool}</span>
                        {m.rationale && <span className="text-muted-foreground"> — {m.rationale}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && (
              <p className="mt-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground">thinking...</p>
            )}
            {error && (
              <p className="mt-4 border border-err px-2 py-1 text-[0.65rem] text-err">[error] {error}</p>
            )}
          </div>
          <footer className="border-t border-border p-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="ask the architect... (cmd+enter to send)"
              rows={3}
              className="w-full border border-border bg-cream px-2 py-1 font-mono text-xs focus:border-ink focus:outline-none"
            />
            <div className="mt-2 flex justify-end">
              <BracketButton variant="primary" onClick={send} loading={busy}>
                send
              </BracketButton>
            </div>
          </footer>
        </aside>
      )}
    </>
  );
}
