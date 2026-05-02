"use client";

import { useState } from "react";
import { BracketButton } from "./BracketButton";
import { useStore } from "@/lib/store";
import { postEventStream } from "@/lib/sse";
import type { AnalysisResult } from "@/lib/core";

export function InputPanel() {
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const setSid = useStore((s) => s.setSid);
  const setSource_ = useStore((s) => s.setSource);
  const setPhase = useStore((s) => s.setPhase);
  const appendChunk = useStore((s) => s.appendAnalysisChunk);
  const setAnalysis = useStore((s) => s.setAnalysis);

  const submit = async () => {
    const value = source.trim();
    if (!value) return;
    setSubmitting(true);
    setError(null);
    setProgress("Starting...");
    setSource_(value);
    setPhase("analyzing");

    try {
      await postEventStream("/api/analyze", { source: value }, {
        session: (data) => {
          const d = data as { sid: string };
          setSid(d.sid);
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("sid", d.sid);
            window.history.replaceState(null, "", url.toString());
          }
        },
        "parse-progress": (data) => {
          const d = data as { message: string };
          setProgress(d.message);
        },
        parsed: (data) => {
          const d = data as { repoName: string; totalFiles: number };
          setProgress(`Parsed ${d.repoName} (${d.totalFiles} files). Analyzing with Claude...`);
        },
        chunk: (data) => {
          const d = data as { text: string };
          appendChunk(d.text);
        },
        analysis: (data) => {
          setAnalysis(data as AnalysisResult);
          setProgress("Analysis complete.");
        },
        done: () => {
          setProgress(null);
          setSubmitting(false);
          setPhase("selecting");
        },
        error: (data) => {
          const d = data as { message?: string; stage?: string };
          setError(`${d.stage ?? "error"}: ${d.message ?? "unknown"}`);
          setSubmitting(false);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-screen-2xl px-8 py-24 xl:px-16">
      <div className="space-y-2">
        <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          [ step 01 / source ]
        </p>
        <h1 className="text-3xl tracking-tight">
          point at a codebase. <span className="caret"></span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste a public GitHub URL or an absolute path on this machine. The
          analyzer reads it, infers cloud services, and walks you through
          deployment.
        </p>
      </div>

      <div className="mt-10 max-w-3xl space-y-3">
        <label className="block text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          source
        </label>
        <input
          type="text"
          autoFocus
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="https://github.com/owner/repo  —  or  —  /absolute/path/to/codebase"
          className="w-full border border-ink bg-transparent px-3 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none"
          disabled={submitting}
        />
        <div className="flex items-center justify-between">
          <p className="text-[0.65rem] text-muted-foreground">
            {progress ?? "press enter or click analyze"}
          </p>
          <BracketButton onClick={submit} loading={submitting} variant="primary">
            analyze
          </BracketButton>
        </div>
        {error && (
          <p className="border border-err px-3 py-2 text-xs text-err">
            [error] {error}
          </p>
        )}
      </div>
    </section>
  );
}
