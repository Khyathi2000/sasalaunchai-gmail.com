import type { ParsedCodebase } from "../../types/index";
import type { ServiceRecommendation } from "../../types/cloud";

export function inferAnalyticsServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = getDeps(codebase);

  const hasBqSdk = deps.has("@google-cloud/bigquery");
  const hasDbt = codebase.files.some((f) => f.path.startsWith("dbt_project") || f.path.includes("/dbt/"));
  const hasManySql = codebase.files.filter((f) => f.path.endsWith(".sql")).length > 5;
  const hasAirbyte = deps.has("airbyte") || codebase.files.some((f) => f.path.includes("airbyte"));

  const wantsWarehouse = hasBqSdk || hasDbt || hasManySql || hasAirbyte;

  if (provider === "gcp" && wantsWarehouse) {
    recs.push({
      serviceId: "bigquery",
      serviceName: "BigQuery",
      category: "analytics",
      provider: "gcp",
      reason:
        hasBqSdk   ? "@google-cloud/bigquery SDK detected" :
        hasDbt     ? "dbt project detected — BigQuery as warehouse" :
        hasManySql ? `${codebase.files.filter((f) => f.path.endsWith(".sql")).length} SQL files detected` :
        "Data pipeline patterns detected",
      confidence: hasBqSdk || hasDbt ? "high" : "medium",
      config: {},
      dependsOn: [],
    });
  }
  // No AWS Athena/Redshift agent yet — could add later as separate agent.

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
