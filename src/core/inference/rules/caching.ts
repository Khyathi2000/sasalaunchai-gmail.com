import type { ParsedCodebase } from "../../types/index";
import type { ServiceRecommendation } from "../../types/cloud";

export function inferCachingServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = new Set(Object.keys((codebase.packageJson?.dependencies as Record<string, string>) ?? {}));

  const hasRedis = deps.has("ioredis") || deps.has("redis") || deps.has("@upstash/redis");

  if (hasRedis) {
    if (provider === "aws") {
      recs.push({
        serviceId: "elasticache", serviceName: "ElastiCache Redis", category: "caching", provider: "aws",
        reason: "Redis dependency detected",
        confidence: "high", config: { engine: "redis" }, dependsOn: ["vpc"],
      });
    } else {
      recs.push({
        serviceId: "memorystore", serviceName: "Memorystore Redis", category: "caching", provider: "gcp",
        reason: "Redis dependency detected",
        confidence: "high", config: { engine: "redis" }, dependsOn: ["vpc-gcp"],
      });
    }
  }

  return recs;
}
