import type { ParsedCodebase } from "../../types/index.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

export function inferNetworkingServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const techStack = new Set(codebase.techStack.map(t => t.toLowerCase()));

  // Always need VPC for AWS
  if (provider === "aws") {
    recs.push({
      serviceId: "vpc", serviceName: "VPC", category: "networking", provider: "aws",
      reason: "Virtual private cloud required for network isolation",
      confidence: "high", config: {}, dependsOn: [],
    });
  }

  // ALB for multi-container or web apps
  const hasWebApp = techStack.has("next.js") || techStack.has("react") || techStack.has("express.js") ||
    techStack.has("fastapi") || techStack.has("django") || techStack.has("flask");

  if (hasWebApp && provider === "aws") {
    recs.push({
      serviceId: "alb", serviceName: "ALB", category: "networking", provider: "aws",
      reason: "Load balancer needed for web application traffic distribution",
      confidence: "high", config: {}, dependsOn: ["vpc"],
    });
  } else if (hasWebApp && provider === "gcp") {
    recs.push({
      serviceId: "cloud-lb", serviceName: "Cloud Load Balancer", category: "networking", provider: "gcp",
      reason: "Load balancer for web application",
      confidence: "high", config: {}, dependsOn: ["vpc-gcp"],
    });
  }

  // CDN for frontend apps
  const hasFrontend = techStack.has("next.js") || techStack.has("react") || techStack.has("vue.js") || techStack.has("svelte");
  if (hasFrontend) {
    if (provider === "aws") {
      recs.push({
        serviceId: "cloudfront", serviceName: "CloudFront", category: "cdn", provider: "aws",
        reason: "CDN for frontend asset delivery and caching",
        confidence: "medium", config: {}, dependsOn: ["s3"],
      });
    } else {
      recs.push({
        serviceId: "cloud-cdn", serviceName: "Cloud CDN", category: "cdn", provider: "gcp",
        reason: "CDN for frontend delivery",
        confidence: "medium", config: {}, dependsOn: ["cloud-lb"],
      });
    }
  }

  return recs;
}
