"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { BracketButton } from "./BracketButton";
import { useStore } from "@/lib/store";
import { postEventStream, StreamHttpError } from "@/lib/sse";
import type { AnalysisResult } from "@/lib/core";

type AnalyzeError =
  | { kind: "generic"; message: string }
  | { kind: "github_not_connected"; message: string }
  | { kind: "repo_not_accessible"; message: string };

export function InputPanel() {
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AnalyzeError | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const { openUserProfile } = useClerk();

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
          const d = data as { message?: string; stage?: string; code?: string };
          setError(toAnalyzeError(d.code, d.message ?? "unknown", d.stage));
          setSubmitting(false);
        },
      });
    } catch (err) {
      // Pre-stream HTTP failures (401, etc) come through here.
      if (err instanceof StreamHttpError && err.status === 401) {
        const code = err.body?.error ?? "github_not_connected";
        setError(
          toAnalyzeError(
            code,
            err.body?.message ?? "Sign in with GitHub to analyze repos.",
          ),
        );
      } else {
        setError({
          kind: "generic",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      setSubmitting(false);
      setProgress(null);
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
          Paste a GitHub URL (public or private — you'll analyze repos with your
          own GitHub permissions) or an absolute path on this machine. The
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
          <ErrorCallout error={error} onReconnect={() => openUserProfile()} />
        )}
      </div>
    </section>
  );
}

function toAnalyzeError(
  code: string | undefined,
  message: string,
  stage?: string,
): AnalyzeError {
  if (code === "repo_not_accessible") return { kind: "repo_not_accessible", message };
  if (code === "github_not_connected") return { kind: "github_not_connected", message };
  return { kind: "generic", message: stage ? `${stage}: ${message}` : message };
}

function ErrorCallout({
  error,
  onReconnect,
}: {
  error: AnalyzeError;
  onReconnect: () => void;
}) {
  if (error.kind === "generic") {
    return (
      <p className="border border-err px-3 py-2 text-xs text-err">
        [error] {error.message}
      </p>
    );
  }

  const title =
    error.kind === "repo_not_accessible"
      ? "couldn't access that repo with your github account"
      : "github not connected";

  const body =
    error.kind === "repo_not_accessible"
      ? "Make sure you're a collaborator on this repo. If you signed in before granting the `repo` scope, reconnect GitHub below — Clerk will prompt for the right scopes."
      : "You need to connect GitHub to analyze repos. Open your account profile and add a GitHub connection.";

  return (
    <div className="border border-err p-3 text-xs">
      <p className="mb-1 text-[0.65rem] uppercase tracking-wider text-err">[ ! ] {title}</p>
      <p className="mb-3 text-foreground/80">{body}</p>
      {error.message && (
        <p className="mb-3 text-[0.65rem] text-muted-foreground">{error.message}</p>
      )}
      <div className="flex items-center gap-3">
        <BracketButton onClick={onReconnect} variant="primary">
          reconnect github
        </BracketButton>
        <span className="text-[0.65rem] text-muted-foreground">
          opens your account profile · disconnect + re-add github
        </span>
      </div>
    </div>
  );
}
