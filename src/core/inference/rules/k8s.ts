import type { ParsedCodebase } from "../../types/index";
import type { ServiceRecommendation } from "../../types/cloud";

export function inferK8sServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];

  const hasManifests = codebase.files.some((f) => {
    if (!f.path.endsWith(".yaml") && !f.path.endsWith(".yml")) return false;
    const c = f.content ?? "";
    return /apiVersion:\s*(apps|v1|networking)/.test(c) && /kind:\s*(Deployment|Service|Ingress|StatefulSet|Job|CronJob)/.test(c);
  });
  const hasHelm = codebase.files.some((f) => f.path.endsWith("Chart.yaml") || f.path.includes("/templates/_helpers.tpl"));
  const hasKustomize = codebase.files.some((f) => f.path.endsWith("kustomization.yaml") || f.path.endsWith("kustomization.yml"));

  const wantsK8s = hasManifests || hasHelm || hasKustomize;
  if (!wantsK8s) return recs;

  if (provider === "gcp") {
    recs.push({
      serviceId: "gke",
      serviceName: "GKE (Autopilot)",
      category: "k8s",
      provider: "gcp",
      reason:
        hasHelm        ? "Helm chart detected — GKE Autopilot for managed k8s" :
        hasKustomize   ? "Kustomize manifest detected" :
        "Kubernetes manifests detected",
      confidence: "high",
      config: { autopilot: true },
      dependsOn: ["vpc-gcp"],
    });
  }
  // EKS for AWS would go here when an eks-agent is added.

  return recs;
}
