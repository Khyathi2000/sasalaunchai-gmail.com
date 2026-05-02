"use client";

import { useStore } from "@/lib/store";
import { CostChart } from "./CostChart";
import { MetricsGrid } from "./MetricsGrid";
import { ServiceControlPanel } from "./ServiceControlPanel";
import { MigrateButton } from "./MigrateButton";

export function Dashboard() {
  const phase = useStore((s) => s.phase);
  if (phase !== "monitoring") return null;

  return (
    <section className="mx-auto w-full max-w-screen-2xl px-8 pb-24 xl:px-16">
      <header className="mb-4 flex items-center justify-between">
        <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          [ step 05 / live ]
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CostChart />
        <MetricsGrid />
        <MigrateButton />
      </div>
      <div className="mt-4">
        <ServiceControlPanel />
      </div>
    </section>
  );
}
