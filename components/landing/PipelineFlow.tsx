"use client";

/**
 * Horizontal 6-step pipeline: ingest → analyze → infer → plan →
 * deploy → observe. Each step is a labeled column; a single beam
 * sweeps left-to-right across all of them so the reader's eye
 * follows the flow.
 *
 * Uses the same SVG/CSS beam approach as BeamGraph.
 */

const STEPS = [
  {
    n: "01",
    name: "ingest",
    body: "Clone or scan. Parse package.json, file tree, tech stack.",
  },
  {
    n: "02",
    name: "analyze",
    body: "11 specialist agents read the repo in parallel. Synthesizer merges. Critic re-runs on gaps.",
  },
  {
    n: "03",
    name: "infer",
    body: "Rule engine + LLM refinement maps tech stack to AWS + GCP service recommendations.",
  },
  {
    n: "04",
    name: "plan",
    body: "Pick a cloud, pick services, see the cost range. Three Mermaid diagrams render live.",
  },
  {
    n: "05",
    name: "deploy",
    body: "Per-service agents emit Terraform. Orchestrator merges, applies, streams logs.",
  },
  {
    n: "06",
    name: "observe",
    body: "Real cost + metrics from Cost Explorer / Cloud Billing. Start, stop, destroy live.",
  },
];

export function PipelineFlow() {
  return (
    <div className="border border-ink">
      {/* Header strip */}
      <div className="flex items-center justify-between border-b border-ink px-4 py-2 text-[0.6rem] uppercase tracking-wider">
        <span>~/pipeline</span>
        <span className="text-muted-foreground flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ember" />
          streaming
        </span>
      </div>

      {/* Beam track sitting above the columns */}
      <div className="relative">
        <svg
          viewBox="0 0 1200 40"
          preserveAspectRatio="none"
          className="block h-10 w-full border-b border-border"
          aria-hidden
        >
          <defs>
            <filter id="pipe-glow" x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="1.5" />
            </filter>
          </defs>
          {/* Track */}
          <line x1="0" y1="20" x2="1200" y2="20" stroke="hsl(0 0% 78%)" strokeWidth={1} />
          {/* Tick marks at each step boundary */}
          {[0, 200, 400, 600, 800, 1000, 1200].map((x) => (
            <line key={x} x1={x} y1="14" x2={x} y2="26" stroke="hsl(0 0% 70%)" strokeWidth={1} />
          ))}
          {/* Two staggered beam packets sweeping left → right */}
          <line
            x1="0"
            y1="20"
            x2="1200"
            y2="20"
            strokeWidth="2"
            strokeLinecap="round"
            className="beam-flow ember-stroke"
            filter="url(#pipe-glow)"
          />
          <line
            x1="0"
            y1="20"
            x2="1200"
            y2="20"
            strokeWidth="2"
            strokeLinecap="round"
            className="beam-flow-slow ember-stroke"
            style={{ animationDelay: "1.4s" }}
            filter="url(#pipe-glow)"
          />
        </svg>
      </div>

      {/* Six column cards */}
      <ol className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6">
        {STEPS.map((step, i) => (
          <li
            key={step.n}
            className={
              "relative bg-cream p-5 " +
              (i < STEPS.length - 1 ? "md:border-r md:border-border " : "") +
              (i < 3 ? "border-b border-border md:border-b-0 " : "") +
              "lg:border-b-0"
            }
          >
            <div className="mb-2 flex items-baseline gap-2 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
              <span>{step.n}</span>
              <span className="text-ink">[ {step.name} ]</span>
            </div>
            <p className="text-xs leading-relaxed text-foreground/80">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
