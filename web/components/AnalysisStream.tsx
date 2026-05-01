"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { MermaidView } from "./MermaidView";
import { BracketButton } from "./BracketButton";

type Tab = "stream" | "flowchart" | "files" | "tech" | "infra";

export function AnalysisStream() {
  const [tab, setTab] = useState<Tab>("stream");
  const streamText = useStore((s) => s.analysisStreamText);
  const analysis = useStore((s) => s.analysis);
  const phase = useStore((s) => s.phase);
  const setPhase = useStore((s) => s.setPhase);

  if (phase === "input") return null;

  const flowchartReady = analysis?.flowchart?.includes("flowchart");
  const filesReady = (analysis?.fileExplanations?.length ?? 0) > 0;
  const techReady = (analysis?.techConsiderations?.length ?? 0) > 0;
  const infraReady = !!analysis?.infraRequirements;

  return (
    <section className="mx-auto w-full max-w-screen-2xl px-8 pb-24 xl:px-16">
      <header className="mb-4 flex items-center justify-between">
        <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          [ step 02 / analysis ]
        </p>
        {analysis && (
          <BracketButton onClick={() => setPhase("selecting")} variant="primary">
            continue → infer services
          </BracketButton>
        )}
      </header>

      <div className="border border-border">
        <nav className="flex border-b border-border text-[0.65rem] uppercase tracking-wider">
          <Tab name="stream" current={tab} onClick={setTab} ready label="stream" />
          <Tab name="flowchart" current={tab} onClick={setTab} ready={flowchartReady} label="flowchart" />
          <Tab name="files" current={tab} onClick={setTab} ready={filesReady} label={`files (${analysis?.fileExplanations?.length ?? 0})`} />
          <Tab name="tech" current={tab} onClick={setTab} ready={techReady} label={`tech (${analysis?.techConsiderations?.length ?? 0})`} />
          <Tab name="infra" current={tab} onClick={setTab} ready={infraReady} label="infra" />
        </nav>

        <div className="max-h-[60vh] overflow-auto p-4">
          {tab === "stream" && (
            <pre className="whitespace-pre-wrap break-words text-xs text-foreground/80">
              {streamText || (
                <span className="text-muted-foreground">awaiting stream...</span>
              )}
              {phase === "analyzing" && <span className="caret"></span>}
            </pre>
          )}
          {tab === "flowchart" && analysis?.flowchart && (
            <MermaidView code={analysis.flowchart} />
          )}
          {tab === "files" && analysis?.fileExplanations && (
            <ul className="space-y-3 text-xs">
              {analysis.fileExplanations.map((f) => (
                <li key={f.path} className="border-b border-border pb-3 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{f.path}</span>
                    <span className="text-[0.65rem] uppercase text-muted-foreground">
                      {f.role} · {f.complexity}
                    </span>
                  </div>
                  <p className="mt-1 text-foreground/80">{f.explanation}</p>
                </li>
              ))}
            </ul>
          )}
          {tab === "tech" && analysis?.techConsiderations && (
            <ul className="space-y-3 text-xs">
              {analysis.techConsiderations.map((t) => (
                <li key={t.name} className="border-b border-border pb-3 last:border-0">
                  <div className="font-medium">{t.name}</div>
                  <p className="mt-1 text-foreground/80">{t.purpose}</p>
                  <p className="mt-1 text-muted-foreground">why: {t.whyChosen}</p>
                </li>
              ))}
            </ul>
          )}
          {tab === "infra" && analysis?.infraRequirements && (
            <pre className="whitespace-pre-wrap text-xs text-foreground/80">
              {JSON.stringify(analysis.infraRequirements, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </section>
  );
}

function Tab({
  name,
  current,
  onClick,
  ready,
  label,
}: {
  name: Tab;
  current: Tab;
  onClick: (t: Tab) => void;
  ready?: boolean;
  label: string;
}) {
  const active = current === name;
  return (
    <button
      onClick={() => onClick(name)}
      disabled={!ready}
      className={
        "px-4 py-2 disabled:opacity-30 " +
        (active ? "bg-ink text-cream" : "hover:bg-ink/[0.05]")
      }
    >
      {label}
    </button>
  );
}
