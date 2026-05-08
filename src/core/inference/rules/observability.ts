import type { ParsedCodebase } from "../../types/index";
import type { ServiceRecommendation } from "../../types/cloud";

export function inferObservabilityServices(_codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  if (provider === "aws") {
    return [{
      serviceId: "cloudwatch", serviceName: "CloudWatch", category: "observability", provider: "aws",
      reason: "Monitoring, logging, and alerting for all deployed services",
      confidence: "high", config: {}, dependsOn: [],
    }];
  } else {
    return [{
      serviceId: "cloud-monitoring", serviceName: "Cloud Monitoring", category: "observability", provider: "gcp",
      reason: "Monitoring and alerting for all deployed services",
      confidence: "high", config: {}, dependsOn: [],
    }];
  }
}
