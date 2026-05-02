import type { ParsedCodebase } from "../../types/index.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

const CRON_PATTERN = /(\*\s+\*\s+\*\s+\*\s+\*|cron\s*\(|rate\s*\(|@(daily|hourly|weekly))/;

export function inferEventServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = getDeps(codebase);
  const fileContents = codebase.files.map((f) => f.content ?? "").join("\n");

  const hasCronLib = deps.has("node-cron") || deps.has("cron") || deps.has("node-schedule");
  const hasBull = deps.has("bull") || deps.has("bullmq");
  const hasCronString = CRON_PATTERN.test(fileContents);
  const hasEventDriven = deps.has("@aws-sdk/client-eventbridge") || deps.has("@google-cloud/tasks");

  const wantsScheduling = hasCronLib || hasBull || hasCronString || hasEventDriven;

  if (provider === "aws" && wantsScheduling) {
    recs.push({
      serviceId: "eventbridge",
      serviceName: "EventBridge",
      category: "events",
      provider: "aws",
      reason:
        hasCronLib ? "Cron library detected (node-cron / node-schedule)" :
        hasBull    ? "Bull/BullMQ queue detected — EventBridge for triggered processing" :
        hasCronString ? "Cron-like schedule expression detected in source" :
        "Event-driven SDK usage detected",
      confidence: hasCronLib || hasBull ? "high" : "medium",
      config: { schedule: "rate(1 hour)" },
      dependsOn: [],
    });
  }

  if (provider === "gcp" && wantsScheduling) {
    recs.push({
      serviceId: "cloud-tasks",
      serviceName: "Cloud Tasks",
      category: "events",
      provider: "gcp",
      reason:
        hasBull       ? "Bull/BullMQ queue detected — Cloud Tasks as managed alternative" :
        hasCronLib    ? "Cron library detected — Cloud Tasks for scheduled execution" :
        "Async task-queue patterns detected",
      confidence: hasBull || hasCronLib ? "high" : "medium",
      config: {},
      dependsOn: [],
    });
  }

  return recs;
}

function getDeps(codebase: ParsedCodebase): Set<string> {
  const out = new Set<string>();
  if (codebase.packageJson) {
    const d = codebase.packageJson.dependencies as Record<string, string> | undefined;
    const dd = codebase.packageJson.devDependencies as Record<string, string> | undefined;
    if (d) Object.keys(d).forEach((k) => out.add(k));
    if (dd) Object.keys(dd).forEach((k) => out.add(k));
  }
  return out;
}
