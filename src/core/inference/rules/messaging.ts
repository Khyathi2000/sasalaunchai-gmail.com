import type { ParsedCodebase } from "../../types/index";
import type { ServiceRecommendation } from "../../types/cloud";

export function inferMessagingServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = new Set(Object.keys((codebase.packageJson?.dependencies as Record<string, string>) ?? {}));
  const fileContents = codebase.files.map(f => f.content).join("\n");

  const hasQueue = deps.has("bull") || deps.has("bullmq") || deps.has("@aws-sdk/client-sqs") ||
    fileContents.includes("SQS") || fileContents.includes("queue");
  const hasPubSub = deps.has("@aws-sdk/client-sns") || fileContents.includes("SNS") ||
    fileContents.includes("pubsub") || fileContents.includes("event-emitter");

  if (hasQueue) {
    if (provider === "aws") {
      recs.push({
        serviceId: "sqs", serviceName: "SQS", category: "messaging", provider: "aws",
        reason: "Queue patterns detected (BullMQ/SQS SDK)",
        confidence: "high", config: {}, dependsOn: [],
      });
    } else {
      recs.push({
        serviceId: "pubsub", serviceName: "Pub/Sub", category: "messaging", provider: "gcp",
        reason: "Queue/messaging patterns detected",
        confidence: "high", config: {}, dependsOn: [],
      });
    }
  }

  if (hasPubSub && provider === "aws") {
    recs.push({
      serviceId: "sns", serviceName: "SNS", category: "messaging", provider: "aws",
      reason: "Pub/sub notification patterns detected",
      confidence: "medium", config: {}, dependsOn: [],
    });
  }

  return recs;
}
