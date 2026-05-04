"use client";

/**
 * The 11 LangGraph specialists arranged in a circle around a central
 * synthesizer, with thin radial edges. Each specialist is a labeled
 * card; one is "active" at any time (rotating) and shows a brief
 * sample finding.
 */

import { useEffect, useState } from "react";

interface Specialist {
  name: string;
  watches: string;
  finding: string;
}

const SPECIALISTS: Specialist[] = [
  { name: "frontend",  watches: "next.config.*, app/**, components/**",  finding: "Next.js 15, app-router, Tailwind. CDN-eligible." },
  { name: "backend",   watches: "server entry, route handlers",           finding: "Node 20, Hono on Cloud Run." },
  { name: "api",       watches: "OpenAPI, route trees, GraphQL",          finding: "REST + 1 GraphQL gateway. Edge-eligible." },
  { name: "database",  watches: "Prisma / Drizzle / SQLAlchemy",          finding: "Postgres 16, 14 models, OLTP." },
  { name: "storage",   watches: "upload code, S3/GCS SDK use",            finding: "User uploads → object storage." },
  { name: "auth",      watches: "Clerk / NextAuth / Cognito SDKs",        finding: "Clerk-managed identity." },
  { name: "jobs",      watches: "BullMQ / cron / workers",                finding: "1 cron, 0 workers." },
  { name: "ml",        watches: "Anthropic / OpenAI / model files",       finding: "Anthropic SDK in 3 routes." },
  { name: "secrets",   watches: ".env*, process.env.* refs",              finding: "9 sensitive vars, none rotated." },
  { name: "scaling",   watches: "concurrency / streaming hints",          finding: "SSE on 4 routes; min 0, max 10." },
  { name: "security",  watches: "CORS / SSRF / rate limits",              finding: "CSRF on; rate limits missing." },
];

export function SpecialistConstellation() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setActiveIdx((i) => (i + 1) % SPECIALISTS.length),
      2400,
    );
    return () => window.clearInterval(id);
  }, []);

  // Polar layout. 11 nodes evenly distributed on a circle.
  const cx = 250;
  const cy = 250;
  const r = 180;
  const positions = SPECIALISTS.map((_, i) => {
    const angle = (i / SPECIALISTS.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });

  const active = SPECIALISTS[activeIdx];

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_360px] md:items-center xl:grid-cols-[1fr_420px]">
      <div className="relative" aria-hidden>
        <svg viewBox="0 0 500 500" className="block w-full max-w-[560px]">
          <defs>
            <filter id="cn-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.4" />
            </filter>
          </defs>
          {/* Outer ring — purely decorative */}
          <circle cx={cx} cy={cy} r={r + 30} fill="none" stroke="hsl(0 0% 88%)" />
          <circle cx={cx} cy={cy} r={r + 60} fill="none" stroke="hsl(0 0% 92%)" strokeDasharray="2 6" />

          {/* Edges from center synthesizer to each specialist */}
          {positions.map((p, i) => (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke={i === activeIdx ? "hsl(18 90% 55%)" : "hsl(0 0% 80%)"}
              strokeWidth={i === activeIdx ? 1.4 : 1}
              filter={i === activeIdx ? "url(#cn-glow)" : undefined}
            />
          ))}

          {/* Specialist nodes */}
          {SPECIALISTS.map((s, i) => {
            const p = positions[i];
            const isActive = i === activeIdx;
            return (
              <g key={s.name} transform={`translate(${p.x}, ${p.y})`}>
                <circle
                  r={isActive ? 6 : 4}
                  fill={isActive ? "hsl(18 90% 55%)" : "hsl(0 0% 4%)"}
                  filter={isActive ? "url(#cn-glow)" : undefined}
                />
                <text
                  x={p.x > cx ? 10 : -10}
                  y={4}
                  textAnchor={p.x > cx ? "start" : "end"}
                  fontFamily="var(--font-mono)"
                  fontSize="11"
                  fill={isActive ? "hsl(0 0% 4%)" : "hsl(0 0% 30%)"}
                  letterSpacing="0.03em"
                >
                  {s.name}
                </text>
              </g>
            );
          })}

          {/* Center synthesizer */}
          <g transform={`translate(${cx}, ${cy})`}>
            <rect x={-52} y={-15} width={104} height={30} fill="hsl(0 0% 4%)" />
            <text
              x={0}
              y={5}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="11"
              fill="hsl(54 33% 97%)"
              letterSpacing="0.05em"
            >
              [ synthesizer ]
            </text>
          </g>
        </svg>
      </div>

      {/* Side readout — the currently-active specialist's finding,
          like a CRT diagnostic panel. */}
      <div className="border border-ink p-5">
        <div className="mb-2 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
          [ specialist · {String(activeIdx + 1).padStart(2, "0")} of {SPECIALISTS.length} ]
        </div>
        <h3 className="display-serif text-2xl tracking-tight">{active.name}</h3>
        <p className="mt-3 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          watches
        </p>
        <p className="mt-1 font-mono text-xs">{active.watches}</p>
        <p className="mt-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          sample finding
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground/80">{active.finding}</p>
        <div className="mt-4 flex gap-1">
          {SPECIALISTS.map((_, i) => (
            <span
              key={i}
              className={
                "h-1 flex-1 transition-colors " +
                (i === activeIdx
                  ? "bg-ember"
                  : i < activeIdx
                    ? "bg-foreground/40"
                    : "bg-border")
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
