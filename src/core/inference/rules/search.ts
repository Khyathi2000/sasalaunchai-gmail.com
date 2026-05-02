import type { ParsedCodebase } from "../../types/index.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

export function inferSearchServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = getDeps(codebase);

  const hasElastic = deps.has("@elastic/elasticsearch") || deps.has("elasticsearch");
  const hasOpenSearch = deps.has("@opensearch-project/opensearch");
  const hasMeilisearch = deps.has("meilisearch");
  const hasAlgolia = deps.has("algoliasearch");

  const wantsSearch = hasElastic || hasOpenSearch || hasMeilisearch || hasAlgolia;

  if (provider === "aws" && wantsSearch && !hasAlgolia /* algolia is a SaaS */) {
    recs.push({
      serviceId: "opensearch",
      serviceName: "OpenSearch",
      category: "search",
      provider: "aws",
      reason:
        hasOpenSearch ? "@opensearch-project SDK detected" :
        hasElastic    ? "Elasticsearch SDK detected — OpenSearch is the AWS-managed equivalent" :
        hasMeilisearch ? "Meilisearch detected — OpenSearch as managed alternative" :
        "Search engine usage detected",
      confidence: hasOpenSearch || hasElastic ? "high" : "medium",
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
