"use client";

import { useStore } from "@/lib/store";

const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-central-1", "ap-south-1", "ap-southeast-1",
  "ap-northeast-1", "ap-southeast-2", "ca-central-1", "sa-east-1",
];

const GCP_REGIONS = [
  "us-central1", "us-east1", "us-east4", "us-west1", "us-west2",
  "europe-west1", "europe-west2", "asia-east1", "asia-southeast1", "australia-southeast1",
];

export function ProviderPicker() {
  const provider = useStore((s) => s.provider);
  const region = useStore((s) => s.region);
  const setProvider = useStore((s) => s.setProvider);
  const setRegion = useStore((s) => s.setRegion);
  const applyMode = useStore((s) => s.applyMode);
  const setApplyMode = useStore((s) => s.setApplyMode);

  const regions = provider === "aws" ? AWS_REGIONS : GCP_REGIONS;
  const defaultRegion = provider === "aws" ? "us-east-1" : "us-central1";

  return (
    <div className="space-y-4 text-xs">
      <div>
        <div className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">provider</div>
        <div className="flex gap-4">
          {(["aws", "gcp"] as const).map((p) => (
            <button
              key={p}
              onClick={() => {
                setProvider(p);
                setRegion(p === "aws" ? "us-east-1" : "us-central1");
              }}
              className={
                "px-3 py-1.5 uppercase tracking-wider " +
                (provider === p ? "bg-ink text-cream" : "border border-ink hover:bg-ink/[0.05]")
              }
            >
              [{provider === p ? "X" : " "}] {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">region</div>
        <select
          value={region || defaultRegion}
          onChange={(e) => setRegion(e.target.value)}
          className="border border-ink bg-transparent px-3 py-1.5 font-mono uppercase tracking-wider focus:outline-none"
        >
          {regions.map((r) => (
            <option key={r} value={r} className="bg-cream text-ink">
              {r}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">mode</div>
        <button
          onClick={() => setApplyMode(!applyMode)}
          className="flex items-center gap-2 px-3 py-1.5 uppercase tracking-wider hover:bg-ink/[0.05]"
        >
          <span className="font-mono">[{applyMode ? "X" : " "}]</span>
          <span>apply (run terraform)</span>
        </button>
        <p className="mt-1 text-[0.65rem] text-muted-foreground">
          {applyMode
            ? "deploys real cloud resources. costs accrue."
            : "writes terraform artifacts only. no cloud changes."}
        </p>
      </div>
    </div>
  );
}
