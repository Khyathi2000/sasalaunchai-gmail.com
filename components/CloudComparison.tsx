"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { DiagramTabs } from "./DiagramTabs";
import type { ServiceRecommendation } from "@/lib/core";

interface ProviderBundle {
  provider: string;
  recommendations: ServiceRecommendation[];
  diagrams: { architecture: string; cicd: string; deployment: string };
  cost: {
    serviceCount: number;
    totalLow: number;
    totalTypical: number;
    totalHigh: number;
    byService: Array<{ serviceId: string; range: { low: number; typical: number; high: number } }>;
  };
  fitness: number;
  byCategory: Record<string, ServiceRecommendation[]>;
}

interface InferResponse {
  providers: Array<"aws" | "gcp">;
  preferred: "aws" | "gcp";
  aws?: ProviderBundle;
  gcp?: ProviderBundle;
  recommendations: ServiceRecommendation[];
}

/**
 * Both-cloud comparison: AWS + GCP recommendations side by side, with
 * three Mermaid diagrams (architecture, CI/CD, deployment flow) and cost
 * ranges. Picks the user's chosen provider into the legacy ServiceGrid
 * via setRecommendations + setProvider.
 */
export function CloudComparison() {
  const sid = useStore((s) => s.sid);
  const codebase = useStore((s) => s.codebase);
  const setRecommendations = useStore((s) => s.setRecommendations);
  const setProvider = useStore((s) => s.setProvider);
  const provider = useStore((s) => s.provider);

  const [bundles, setBundles] = useState<{ aws?: ProviderBundle; gcp?: ProviderBundle } | null>(null);
  const [preferred, setPreferred] = useState<"aws" | "gcp">("aws");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch both clouds whenever we land on a fresh codebase.
  useEffect(() => {
    if (!sid || !codebase) return;
    if (bundles) return;
    setLoading(true);
    fetch("/api/infer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid, region: "us-east-1" }), // no provider → both
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data: InferResponse) => {
        setBundles({ aws: data.aws, gcp: data.gcp });
        setPreferred(data.preferred);
        setProvider(data.preferred);
        setRecommendations(data.recommendations);
      })
      .catch((e) => setError(typeof e === "string" ? e : String(e)))
      .finally(() => setLoading(false));
  }, [sid, codebase, bundles, setRecommendations, setProvider]);

  const choose = (which: "aws" | "gcp") => {
    if (!bundles?.[which]) return;
    setProvider(which);
    setRecommendations(bundles[which]!.recommendations);
  };

  if (!sid || !codebase) return null;
  if (loading) {
    return (
      <section className="border-y border-border px-4 py-3 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        comparing aws vs gcp...
      </section>
    );
  }
  if (error) {
    return (
      <section className="border-y border-err px-4 py-3 text-[0.65rem] text-err">
        [error] could not infer cloud recommendations: {error}
      </section>
    );
  }
  if (!bundles) return null;

  const active = bundles[provider] ?? bundles[preferred];
  if (!active) return null;

  return (
    <section className="border-y border-border">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-3">
        <h2 className="text-[0.65rem] uppercase tracking-wider">[ cloud comparison ]</h2>
        <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider">
          <ProviderToggle label="aws" active={provider === "aws"} disabled={!bundles.aws} onClick={() => choose("aws")} bundle={bundles.aws} preferred={preferred === "aws"} />
          <ProviderToggle label="gcp" active={provider === "gcp"} disabled={!bundles.gcp} onClick={() => choose("gcp")} bundle={bundles.gcp} preferred={preferred === "gcp"} />
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.4fr]">
        <CostBreakdown bundle={active} />
        <DiagramTabs diagrams={active.diagrams} />
      </div>
    </section>
  );
}

function ProviderToggle({
  label,
  active,
  disabled,
  onClick,
  bundle,
  preferred,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  bundle?: ProviderBundle;
  preferred: boolean;
}) {
  const cls = active
    ? "border border-ink bg-ink text-cream"
    : disabled
    ? "border border-border text-muted-foreground/40"
    : "border border-border text-muted-foreground hover:text-ink";
  return (
    <button onClick={onClick} disabled={disabled} className={`${cls} px-2 py-1`}>
      [{label}]
      {bundle && (
        <span className="ml-2 normal-case">
          fit {Math.round(bundle.fitness * 100)}% · ${bundle.cost.totalTypical.toFixed(2)}/day
          {preferred && " · suggested"}
        </span>
      )}
    </button>
  );
}

function CostBreakdown({ bundle }: { bundle: ProviderBundle }) {
  return (
    <div className="border border-border p-3 text-xs">
      <h3 className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        [ cost estimate · usd / day ]
      </h3>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-2xl">${bundle.cost.totalTypical.toFixed(2)}</span>
        <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          range ${bundle.cost.totalLow.toFixed(2)} – ${bundle.cost.totalHigh.toFixed(2)}
        </span>
      </div>
      <h4 className="mb-1 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        [ services · {bundle.recommendations.length} ]
      </h4>
      <ul className="grid gap-x-4 gap-y-0.5 lg:grid-cols-2">
        {Object.entries(bundle.byCategory).map(([cat, items]) => (
          <li key={cat} className="flex items-baseline gap-2">
            <span className="text-muted-foreground">{cat}</span>
            <span className="font-mono">{items.map((i) => i.serviceId).join(", ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
