import type { ParsedCodebase } from "../../types/index.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

export function inferWorkflowServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = getDeps(codebase);
  const fileContents = codebase.files.map((f) => f.content ?? "").join("\n");

  const hasSfnSdk = deps.has("@aws-sdk/client-sfn");
  const hasWorkflowsSdk = deps.has("@google-cloud/workflows");
  const hasTemporal = deps.has("@temporalio/client") || deps.has("temporalio");
  const hasInngest = deps.has("inngest");
  const hasMultiStep = /(StateMachine|workflow|orchestrate|step\s*\.\s*invoke)/i.test(fileContents) && hasSfnSdk;

  if (provider === "aws" && (hasSfnSdk || hasTemporal || hasInngest || hasMultiStep)) {
    recs.push({
      serviceId: "step-functions",
      serviceName: "Step Functions",
      category: "workflows",
      provider: "aws",
      reason:
        hasSfnSdk     ? "@aws-sdk/client-sfn detected" :
        hasTemporal   ? "Temporal client detected — Step Functions as managed alternative" :
        hasInngest    ? "Inngest detected — Step Functions as managed alternative" :
        "Multi-step workflow patterns detected",
      confidence: hasSfnSdk ? "high" : "medium",
      config: {},
      dependsOn: [],
    });
  }

  if (provider === "gcp" && (hasWorkflowsSdk || hasTemporal || hasInngest)) {
    recs.push({
      serviceId: "cloud-workflows",
      serviceName: "Cloud Workflows",
      category: "workflows",
      provider: "gcp",
      reason:
        hasWorkflowsSdk ? "@google-cloud/workflows detected" :
        "Workflow orchestration patterns detected",
      confidence: hasWorkflowsSdk ? "high" : "medium",
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
