import type { ParsedCodebase, AnalysisResult } from "../types/index.js";
import type { ServiceRecommendation } from "../types/cloud.js";
import { inferComputeServices } from "./rules/compute.js";
import { inferDatabaseServices } from "./rules/database.js";
import { inferStorageServices } from "./rules/storage.js";
import { inferNetworkingServices } from "./rules/networking.js";
import { inferMessagingServices } from "./rules/messaging.js";
import { inferCachingServices } from "./rules/caching.js";
import { inferAuthServices } from "./rules/auth.js";
import { inferObservabilityServices } from "./rules/observability.js";

export function inferServices(
  codebase: ParsedCodebase,
  analysis: AnalysisResult | undefined,
  provider: string
): ServiceRecommendation[] {
  // Layer 1: Rule-based inference from code patterns
  const recommendations: ServiceRecommendation[] = [
    ...inferNetworkingServices(codebase, provider),
    ...inferAuthServices(codebase, provider),
    ...inferComputeServices(codebase, provider),
    ...inferDatabaseServices(codebase, provider),
    ...inferStorageServices(codebase, provider),
    ...inferCachingServices(codebase, provider),
    ...inferMessagingServices(codebase, provider),
    ...inferObservabilityServices(codebase, provider),
  ];

  // Layer 2: Enhance with infra requirements from Claude analysis
  if (analysis?.infraRequirements) {
    const infra = analysis.infraRequirements;

    // Add secrets manager if sensitive env vars detected
    const hasSensitiveVars = infra.envVars.some(v => v.sensitive);
    if (hasSensitiveVars && !recommendations.find(r => r.serviceId === "secrets-manager")) {
      if (provider === "aws") {
        recommendations.push({
          serviceId: "secrets-manager", serviceName: "Secrets Manager", category: "secrets", provider: "aws",
          reason: `${infra.envVars.filter(v => v.sensitive).length} sensitive environment variables detected`,
          confidence: "high", config: {}, dependsOn: [],
        });
      } else {
        recommendations.push({
          serviceId: "secret-manager", serviceName: "Secret Manager", category: "secrets", provider: "gcp",
          reason: "Sensitive environment variables detected",
          confidence: "high", config: {}, dependsOn: [],
        });
      }
    }
  }

  // Deduplicate by serviceId
  const seen = new Set<string>();
  const deduped: ServiceRecommendation[] = [];
  for (const rec of recommendations) {
    if (!seen.has(rec.serviceId)) {
      seen.add(rec.serviceId);
      deduped.push(rec);
    }
  }

  return deduped;
}

export function buildDependencyOrder(recommendations: ServiceRecommendation[]): string[][] {
  const serviceIds = new Set(recommendations.map(r => r.serviceId));
  const depMap = new Map<string, Set<string>>();
  const allIds = new Set<string>();

  for (const rec of recommendations) {
    allIds.add(rec.serviceId);
    const deps = new Set(rec.dependsOn.filter(d => serviceIds.has(d)));
    depMap.set(rec.serviceId, deps);
  }

  // Topological sort into tiers
  const tiers: string[][] = [];
  const placed = new Set<string>();

  while (placed.size < allIds.size) {
    const tier: string[] = [];
    for (const id of allIds) {
      if (placed.has(id)) continue;
      const deps = depMap.get(id) ?? new Set();
      if ([...deps].every(d => placed.has(d))) {
        tier.push(id);
      }
    }
    if (tier.length === 0) {
      // Circular dependency — just add remaining
      for (const id of allIds) {
        if (!placed.has(id)) tier.push(id);
      }
    }
    tier.forEach(id => placed.add(id));
    tiers.push(tier);
  }

  return tiers;
}
