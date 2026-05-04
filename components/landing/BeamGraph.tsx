"use client";

/**
 * Hero deployment-topology visualization.
 *
 * Shows the Sasa Launch pipeline as a live graph: a git source on the
 * left fans out through analyze + infer agents to per-cloud service
 * clusters on the right. Each edge animates a stream of "packets"
 * (dashed ember strokes) sliding along the path so the whole graph
 * looks like it's running, not posed.
 *
 * Pure SVG + CSS — no Three.js, no canvas. Sharp at any zoom, ~6 KB.
 *
 * Design notes:
 *  - The beam packets are short stroke-dasharray segments on top of a
 *    subtle gray base path. Animating stroke-dashoffset slides them.
 *  - Each beam has a slightly different animation delay so the graph
 *    never looks synchronized — feels like real network traffic.
 *  - Nodes are bracketed text labels in keeping with the rest of the
 *    UI. Active leaf nodes pulse softly to suggest "deployed".
 */

import type { CSSProperties } from "react";

interface NodeDef {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Visual emphasis. */
  variant?: "source" | "agent" | "hub" | "service";
  /** Soft pulse to suggest live state. */
  live?: boolean;
}

interface EdgeDef {
  from: string;
  to: string;
  /** Stagger offset, seconds. Each edge gets its own so beams don't
   * fire in lockstep. */
  delay?: number;
  /** Use the slower flow rate — for "settled" downstream services. */
  slow?: boolean;
}

const NODES: NodeDef[] = [
  // Source
  { id: "git", label: "[ git ]", x: 70, y: 240, variant: "source" },

  // Agents
  { id: "analyze", label: "[ analyze ]", x: 230, y: 160, variant: "agent" },
  { id: "critic", label: "[ critic ]", x: 230, y: 320, variant: "agent" },
  { id: "infer", label: "[ infer ]", x: 380, y: 240, variant: "agent" },

  // Hubs
  { id: "aws", label: "[ aws ]", x: 540, y: 140, variant: "hub" },
  { id: "gcp", label: "[ gcp ]", x: 540, y: 340, variant: "hub" },

  // Deployed AWS services
  { id: "vpc", label: "vpc", x: 720, y: 70, variant: "service", live: true },
  { id: "ecs", label: "ecs", x: 720, y: 130, variant: "service", live: true },
  { id: "rds", label: "rds", x: 720, y: 190, variant: "service", live: true },
  { id: "alb", label: "alb", x: 720, y: 250, variant: "service", live: true },

  // Deployed GCP services
  { id: "run", label: "cloud-run", x: 720, y: 290, variant: "service", live: true },
  { id: "sql", label: "cloud-sql", x: 720, y: 350, variant: "service", live: true },
  { id: "gcs", label: "gcs", x: 720, y: 410, variant: "service", live: true },
];

const EDGES: EdgeDef[] = [
  { from: "git", to: "analyze", delay: 0 },
  { from: "git", to: "critic", delay: 0.4 },
  { from: "analyze", to: "infer", delay: 0.8 },
  { from: "critic", to: "infer", delay: 1.2 },
  { from: "infer", to: "aws", delay: 0.2 },
  { from: "infer", to: "gcp", delay: 0.6 },
  { from: "aws", to: "vpc", delay: 0, slow: true },
  { from: "aws", to: "ecs", delay: 0.5, slow: true },
  { from: "aws", to: "rds", delay: 1.0, slow: true },
  { from: "aws", to: "alb", delay: 1.5, slow: true },
  { from: "gcp", to: "run", delay: 0.2, slow: true },
  { from: "gcp", to: "sql", delay: 0.7, slow: true },
  { from: "gcp", to: "gcs", delay: 1.2, slow: true },
];

/** Cubic-bezier path between two points with horizontal control
 * handles. Produces gentle s-curves that read as "signal flow". */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = (x2 - x1) * 0.55;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function nodeById(id: string): NodeDef | undefined {
  return NODES.find((n) => n.id === id);
}

export function BeamGraph() {
  return (
    <div className="relative w-full" aria-hidden>
      <svg
        viewBox="0 0 800 480"
        className="block w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        <defs>
          {/* Glow used for the active beam packets. Two-pass blur gives
              a soft halo without smudging the dashes. */}
          <filter id="bg-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blurred" />
            <feMerge>
              <feMergeNode in="blurred" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Faint background grid — anchors the graph in space. */}
          <pattern
            id="bg-grid"
            x="0"
            y="0"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="0" cy="0" r="0.6" fill="hsl(0 0% 80%)" />
          </pattern>
        </defs>

        <rect width="800" height="480" fill="url(#bg-grid)" opacity="0.7" />

        {/* === Edges (paths) === */}
        {EDGES.map((edge) => {
          const a = nodeById(edge.from);
          const b = nodeById(edge.to);
          if (!a || !b) return null;
          const d = curve(a.x, a.y, b.x, b.y);
          return (
            <g key={`${edge.from}-${edge.to}`}>
              {/* Base track — subtle, no animation. */}
              <path d={d} fill="none" stroke="hsl(0 0% 78%)" strokeWidth={1} />
              {/* Beam packet — dashed, slides along the path via
                  stroke-dashoffset animation. Stagger via delay. */}
              <path
                d={d}
                fill="none"
                strokeWidth={1.6}
                strokeLinecap="round"
                className={
                  edge.slow ? "beam-flow-slow ember-stroke" : "beam-flow ember-stroke"
                }
                style={
                  {
                    animationDelay: `${edge.delay ?? 0}s`,
                  } as CSSProperties
                }
                filter="url(#bg-glow)"
              />
            </g>
          );
        })}

        {/* === Nodes === */}
        {NODES.map((n) => (
          <Node key={n.id} node={n} />
        ))}
      </svg>

      {/* Legend strip — gives the graph a caption like a technical
          manual figure. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
        <span>fig. 01 · live deployment topology</span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-px w-4 bg-[hsl(0_0%_78%)]" />
          <span>track</span>
          <span className="inline-block h-[2px] w-4 bg-ember shadow-[0_0_4px_hsl(28_100%_60%)]" />
          <span>signal</span>
          <span className="inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ember" />
          <span>live service</span>
        </span>
      </div>
    </div>
  );
}

function Node({ node }: { node: NodeDef }) {
  const fill = node.variant === "source" ? "hsl(0 0% 4%)" : "hsl(54 33% 97%)";
  const textColor = node.variant === "source" ? "hsl(54 33% 97%)" : "hsl(0 0% 4%)";
  const stroke = node.variant === "service" && node.live ? "hsl(18 90% 55%)" : "hsl(0 0% 4%)";

  // Estimate text width — Geist Mono is roughly 0.6em per char at the
  // sizes we use; pad 14px each side. Good enough without a measurer.
  const charWidth = node.variant === "service" ? 6.8 : 7.5;
  const padding = 14;
  const w = Math.max(48, node.label.length * charWidth + padding * 2);
  const h = node.variant === "service" ? 22 : 28;

  return (
    <g transform={`translate(${node.x - w / 2}, ${node.y - h / 2})`}>
      {node.live && (
        <circle
          cx={w + 6}
          cy={h / 2}
          r={3}
          fill="hsl(18 90% 55%)"
          className="pulse-soft"
          filter="url(#bg-glow)"
        />
      )}
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill={fill}
        stroke={stroke}
        strokeWidth={node.variant === "service" && node.live ? 1.2 : 1}
      />
      <text
        x={w / 2}
        y={h / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--font-mono)"
        fontSize={node.variant === "service" ? 10 : 12}
        fill={textColor}
        letterSpacing="0.03em"
      >
        {node.label}
      </text>
    </g>
  );
}
