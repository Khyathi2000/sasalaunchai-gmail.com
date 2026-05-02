import type { ParsedCodebase } from "../../types/index.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

export function inferAuthServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = new Set(Object.keys((codebase.packageJson?.dependencies as Record<string, string>) ?? {}));

  const hasAuth = deps.has("@clerk/nextjs") || deps.has("next-auth") || deps.has("passport") ||
    deps.has("jsonwebtoken") || deps.has("jose") || deps.has("bcrypt");

  // Always include IAM
  if (provider === "aws") {
    recs.push({
      serviceId: "iam", serviceName: "IAM", category: "auth", provider: "aws",
      reason: "IAM roles and policies required for all AWS services",
      confidence: "high", config: {}, dependsOn: [],
    });

    if (hasAuth && !deps.has("@clerk/nextjs")) {
      recs.push({
        serviceId: "cognito", serviceName: "Cognito", category: "auth", provider: "aws",
        reason: "User authentication patterns detected — Cognito for user pool management",
        confidence: "medium", config: {}, dependsOn: [],
      });
    }
  } else {
    recs.push({
      serviceId: "cloud-iam", serviceName: "Cloud IAM", category: "auth", provider: "gcp",
      reason: "IAM required for all GCP services",
      confidence: "high", config: {}, dependsOn: [],
    });
  }

  return recs;
}
