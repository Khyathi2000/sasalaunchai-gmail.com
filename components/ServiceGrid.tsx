"use client";

import { useEffect, useState } from "react";
import { BracketCheckbox } from "./BracketCheckbox";
import { BracketButton } from "./BracketButton";
import { ProviderPicker } from "./ProviderPicker";
import { useStore, selectedServiceIds } from "@/lib/store";
import type { ServiceRecommendation } from "@/lib/core";

const COSTS: Record<string, number> = {
  // AWS
  vpc: 0, iam: 0, ec2: 0.5, ecs: 0.8, lambda: 0.05, rds: 1.2, s3: 0.05,
  cloudfront: 0.1, alb: 0.7, elasticache: 0.7, sqs: 0.02, cloudwatch: 0.1,
  route53: 0.02, "secrets-manager": 0.02, ecr: 0.1, dynamodb: 0.08,
  "api-gateway": 0.12, cognito: 0.05, eventbridge: 0.02,
  "app-runner": 0.5, opensearch: 1.3, "step-functions": 0.05,
  // GCP
  "vpc-gcp": 0, "cloud-iam": 0, gce: 0.2, "cloud-run": 0.5,
  "cloud-functions": 0.03, "cloud-sql": 1.0, firestore: 0.06, gcs: 0.04,
  "cloud-cdn": 0.08, "cloud-lb": 0.6, memorystore: 0.55, pubsub: 0.02,
  "artifact-registry": 0.05, "secret-manager": 0.02, "cloud-monitoring": 0.05,
  "cloud-build": 0.05, bigquery: 0.10, gke: 2.40, "vertex-ai": 0.20,
  "cloud-tasks": 0.02, "cloud-workflows": 0.02,
};

export function ServiceGrid() {
  const phase = useStore((s) => s.phase);
  const sid = useStore((s) => s.sid);
  const provider = useStore((s) => s.provider);
  const region = useStore((s) => s.region);
  const recommendations = useStore((s) => s.recommendations);
  const selections = useStore((s) => s.selections);
  const toggleSelection = useStore((s) => s.toggleSelection);
  const setRecommendations = useStore((s) => s.setRecommendations);
  const setPhase = useStore((s) => s.setPhase);
  const setPlanId = useStore((s) => s.setPlanId);

  const [loadingInfer, setLoadingInfer] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "selecting" || !sid || recommendations.length > 0) return;
    setLoadingInfer(true);
    fetch("/api/infer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid, provider, region, refine: true }),
    })
      .then((r) => r.json())
      .then((data: { recommendations?: ServiceRecommendation[]; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setRecommendations(data.recommendations ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingInfer(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sid, provider]);

  if (phase !== "selecting" && phase !== "input") return null;
  if (phase === "input") return null;

  const ids = selectedServiceIds(useStore.getState());
  const dailyEstimate = ids.reduce((sum, id) => sum + (COSTS[id] ?? 0.1), 0);

  const grouped = groupByCategory(recommendations);

  const submitPlan = async () => {
    if (!sid) return;
    setLoadingPlan(true);
    setError(null);
    try {
      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sid,
          provider,
          region,
          selections: ids,
          applyMode: useStore.getState().applyMode,
        }),
      });
      const planData = (await planRes.json()) as { planId?: string; error?: string };
      if (planData.error) throw new Error(planData.error);
      if (planData.planId) setPlanId(planData.planId);
      setPhase("deploying");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingPlan(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-screen-2xl px-8 pb-24 xl:px-16">
      <header className="mb-4 flex items-center justify-between">
        <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          [ step 03 / services ]
        </p>
        <div className="flex items-center gap-6 text-xs">
          <span className="text-muted-foreground">
            {ids.length} selected · est. ${dailyEstimate.toFixed(2)}/day · ${(dailyEstimate * 30).toFixed(2)}/mo
          </span>
          <BracketButton
            variant="primary"
            disabled={ids.length === 0 || loadingInfer}
            loading={loadingPlan}
            onClick={submitPlan}
          >
            deploy →
          </BracketButton>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[320px,1fr] xl:grid-cols-[360px,1fr]">
        <aside className="border border-border p-4">
          <ProviderPicker />
        </aside>
        <div className="border border-border p-4">
          {loadingInfer && (
            <p className="text-xs text-muted-foreground">
              [running inference engine...] <span className="caret"></span>
            </p>
          )}
          {!loadingInfer && recommendations.length === 0 && (
            <p className="text-xs text-muted-foreground">no recommendations.</p>
          )}
          {Object.entries(grouped).map(([category, recs]) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                [ {category} ]
              </h3>
              <div className="space-y-1">
                {recs.map((rec) => (
                  <BracketCheckbox
                    key={rec.serviceId}
                    checked={!!selections[rec.serviceId]}
                    onChange={() => toggleSelection(rec.serviceId)}
                    label={`${rec.serviceId} · ${rec.serviceName}`}
                    description={rec.reason}
                    trailing={`$${(COSTS[rec.serviceId] ?? 0.1).toFixed(2)}/d · ${rec.confidence}`}
                  />
                ))}
              </div>
            </div>
          ))}
          {error && <p className="mt-3 text-xs text-err">[error] {error}</p>}
        </div>
      </div>
    </section>
  );
}

function groupByCategory(recs: ServiceRecommendation[]): Record<string, ServiceRecommendation[]> {
  const order = [
    "network", "auth", "compute", "orchestration", "serverless",
    "k8s", "container-registry",
    "api", "database", "storage", "cache",
    "search", "analytics", "ml",
    "messaging", "events", "workflows",
    "secrets", "observability", "other",
  ];
  const out: Record<string, ServiceRecommendation[]> = {};
  for (const rec of recs) {
    const cat = rec.category || "other";
    out[cat] = out[cat] ?? [];
    out[cat].push(rec);
  }
  return Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }),
  );
}
