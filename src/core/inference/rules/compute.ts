import type { ParsedCodebase } from "../../types/index";
import type { ServiceRecommendation } from "../../types/cloud";

export function inferComputeServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const techStack = new Set(codebase.techStack.map(t => t.toLowerCase()));
  const hasDocker = codebase.files.some(f => {
    const name = f.path.split("/").pop()?.toLowerCase() ?? "";
    return name === "dockerfile" || name.startsWith("dockerfile.") || name === "docker-compose.yml" || name === "docker-compose.yaml";
  });
  const hasServerlessConfig = codebase.files.some(f => f.path.includes("serverless.yml") || f.path.includes("serverless.ts"));
  const isStaticSite = techStack.has("next.js") && codebase.files.some(f => f.content?.includes("output: 'export'") || f.content?.includes("output: \"export\""));

  if (provider === "aws") {
    if (hasServerlessConfig || isStaticSite) {
      recs.push({
        serviceId: "lambda", serviceName: "Lambda", category: "serverless", provider: "aws",
        reason: hasServerlessConfig ? "Serverless config detected (serverless.yml)" : "Static site export pattern detected",
        confidence: "high", config: {}, dependsOn: ["iam"],
      });
    } else if (hasDocker) {
      recs.push({
        serviceId: "ecs", serviceName: "ECS Fargate", category: "orchestration", provider: "aws",
        reason: "Dockerfile detected — containerized deployment with ECS Fargate",
        confidence: "high", config: {}, dependsOn: ["vpc", "iam", "ecr"],
      });
      recs.push({
        serviceId: "ecr", serviceName: "ECR", category: "container-registry", provider: "aws",
        reason: "Container registry needed for Docker images",
        confidence: "high", config: {}, dependsOn: [],
      });
    } else {
      // Default to ECS for web apps
      recs.push({
        serviceId: "ecs", serviceName: "ECS Fargate", category: "orchestration", provider: "aws",
        reason: "Web application detected — containerized deployment recommended",
        confidence: "medium", config: {}, dependsOn: ["vpc", "iam", "ecr"],
      });
      recs.push({
        serviceId: "ecr", serviceName: "ECR", category: "container-registry", provider: "aws",
        reason: "Container registry for application images",
        confidence: "medium", config: {}, dependsOn: [],
      });
    }
  } else if (provider === "gcp") {
    if (hasDocker || !hasServerlessConfig) {
      recs.push({
        serviceId: "cloud-run", serviceName: "Cloud Run", category: "orchestration", provider: "gcp",
        reason: "Serverless container platform — ideal for web applications",
        confidence: "high", config: {}, dependsOn: ["artifact-registry"],
      });
      recs.push({
        serviceId: "artifact-registry", serviceName: "Artifact Registry", category: "container-registry", provider: "gcp",
        reason: "Container registry for Docker images",
        confidence: "high", config: {}, dependsOn: [],
      });
    } else {
      recs.push({
        serviceId: "cloud-functions", serviceName: "Cloud Functions", category: "serverless", provider: "gcp",
        reason: "Serverless functions pattern detected",
        confidence: "high", config: {}, dependsOn: ["cloud-iam"],
      });
    }
  }

  return recs;
}
