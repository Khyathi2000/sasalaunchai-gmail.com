// Mermaid diagram builders. Three deterministic views per recommendation
// set:
//   - architecture: services as nodes, edges from `dependsOn`.
//   - cicd: build/test/push/deploy pipeline derived from CI files +
//     chosen CI service.
//   - deploymentFlow: orchestrator's tier order (the same topological
//     sort the deployment-orchestrator uses).
//
// Output is plain Mermaid source. The UI runs it through `mermaid` (npm)
// for rendering.

import type { ServiceRecommendation } from "../types/cloud.js";
import { buildDependencyOrder } from "./inference-engine.js";

const NODE_LABELS: Record<string, string> = {
  // AWS
  vpc: "VPC",
  iam: "IAM",
  ec2: "EC2",
  ecs: "ECS Fargate",
  fargate: "ECS Fargate",
  lambda: "Lambda",
  rds: "RDS",
  s3: "S3",
  cloudfront: "CloudFront",
  alb: "ALB",
  elasticache: "ElastiCache",
  sqs: "SQS",
  sns: "SNS",
  cloudwatch: "CloudWatch",
  route53: "Route 53",
  "secrets-manager": "Secrets Manager",
  ecr: "ECR",
  cognito: "Cognito",
  "api-gateway": "API Gateway",
  dynamodb: "DynamoDB",
  codepipeline: "CodePipeline",
  codebuild: "CodeBuild",
  eventbridge: "EventBridge",
  "app-runner": "App Runner",
  opensearch: "OpenSearch",
  "step-functions": "Step Functions",
  bedrock: "Bedrock",
  eks: "EKS",
  // GCP
  "vpc-gcp": "VPC",
  "cloud-iam": "IAM",
  gce: "GCE",
  "cloud-run": "Cloud Run",
  "cloud-functions": "Cloud Functions",
  "cloud-sql": "Cloud SQL",
  firestore: "Firestore",
  gcs: "GCS",
  "cloud-cdn": "Cloud CDN",
  "cloud-lb": "Cloud LB",
  memorystore: "Memorystore",
  pubsub: "Pub/Sub",
  "artifact-registry": "Artifact Registry",
  "secret-manager": "Secret Manager",
  "cloud-monitoring": "Cloud Monitoring",
  "cloud-build": "Cloud Build",
  bigquery: "BigQuery",
  gke: "GKE",
  "vertex-ai": "Vertex AI",
  "cloud-tasks": "Cloud Tasks",
  "cloud-workflows": "Cloud Workflows",
};

function nodeId(serviceId: string): string {
  // Mermaid IDs need to be alphanumeric. Snake-case the service id.
  return serviceId.replace(/[^a-zA-Z0-9]/g, "_");
}

function nodeLabel(serviceId: string): string {
  return NODE_LABELS[serviceId] ?? serviceId;
}

function nodeShape(serviceId: string, category: string): [string, string] {
  // Shape hints by category — boxes are default, databases are cylinders,
  // queues are subroutine-shaped, observability is hexagon.
  if (category === "database" || category === "cache" || category === "search") return ["[(", ")]"];
  if (category === "messaging" || category === "events") return ["[/", "/]"];
  if (category === "observability") return ["{{", "}}"];
  if (category === "cdn" || category === "networking") return ["((", "))"];
  return ["[", "]"];
}

/**
 * Service-architecture flowchart.
 *   nodes = services, edges = dependsOn relationships.
 */
export function buildArchitectureMermaid(recommendations: ServiceRecommendation[]): string {
  if (recommendations.length === 0) {
    return "flowchart TD\n  Empty[/No services recommended/]";
  }
  const lines: string[] = ["flowchart TD"];
  // Group by category for visual subgraphs.
  const byCategory = new Map<string, ServiceRecommendation[]>();
  for (const r of recommendations) {
    const arr = byCategory.get(r.category) ?? [];
    arr.push(r);
    byCategory.set(r.category, arr);
  }
  for (const [category, items] of byCategory) {
    if (items.length === 1) {
      const r = items[0];
      const [open, close] = nodeShape(r.serviceId, r.category);
      lines.push(`  ${nodeId(r.serviceId)}${open}"${nodeLabel(r.serviceId)}"${close}`);
      continue;
    }
    const sgId = `sg_${nodeId(category)}`;
    lines.push(`  subgraph ${sgId}[${category}]`);
    for (const r of items) {
      const [open, close] = nodeShape(r.serviceId, r.category);
      lines.push(`    ${nodeId(r.serviceId)}${open}"${nodeLabel(r.serviceId)}"${close}`);
    }
    lines.push(`  end`);
  }
  // Edges from dependsOn.
  for (const r of recommendations) {
    for (const dep of r.dependsOn ?? []) {
      // Only draw edges to services that are also in the set.
      if (recommendations.find((x) => x.serviceId === dep)) {
        lines.push(`  ${nodeId(dep)} --> ${nodeId(r.serviceId)}`);
      }
    }
  }
  return lines.join("\n");
}

/**
 * CI/CD pipeline diagram.
 *
 * Stages: source → install → lint → test → build → push → deploy.
 * Adapted to the chosen CI service (Cloud Build, CodePipeline+CodeBuild,
 * GitHub Actions). The CI service appears as a wrapping subgraph.
 */
export function buildCicdMermaid(
  recommendations: ServiceRecommendation[],
  options?: { hasGithubActions?: boolean; hasDockerfile?: boolean },
): string {
  const ci = pickCiService(recommendations);
  const target = pickDeployTarget(recommendations);
  const usesContainer = !!options?.hasDockerfile || isContainerTarget(target);

  const stages = ["source", "install", "lint", "test", "build"];
  if (usesContainer) stages.push("push");
  stages.push("deploy");

  const lines: string[] = ["flowchart LR"];
  lines.push(`  Dev["dev commit"] --> source`);
  lines.push(`  subgraph ci[${ci}]`);
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    lines.push(`    ${s}["${s}"]`);
    if (i > 0) lines.push(`    ${stages[i - 1]} --> ${s}`);
  }
  lines.push(`  end`);
  lines.push(`  deploy --> Target["${nodeLabel(target ?? "service")}"]`);
  if (usesContainer) {
    const registry = pickRegistry(recommendations);
    if (registry) lines.push(`  push --> Reg["${nodeLabel(registry)}"]`);
  }
  return lines.join("\n");
}

/**
 * Deployment-flow diagram. Shows the orchestrator's tier order — services
 * with no dependencies run first, then dependents. Each tier becomes a
 * Mermaid subgraph.
 */
export function buildDeploymentFlowMermaid(recommendations: ServiceRecommendation[]): string {
  if (recommendations.length === 0) {
    return "flowchart TD\n  Empty[/No services to deploy/]";
  }
  const tiers = buildDependencyOrder(recommendations);
  const lines: string[] = ["flowchart TD"];
  for (let i = 0; i < tiers.length; i++) {
    const sgId = `tier_${i}`;
    lines.push(`  subgraph ${sgId}[Tier ${i + 1}]`);
    for (const id of tiers[i]) {
      lines.push(`    ${nodeId(id)}["${nodeLabel(id)}"]`);
    }
    lines.push(`  end`);
    if (i > 0) lines.push(`  tier_${i - 1} ==> tier_${i}`);
  }
  return lines.join("\n");
}

// Helpers ------------------------------------------------------------------

function pickCiService(recs: ServiceRecommendation[]): string {
  if (recs.find((r) => r.serviceId === "codepipeline")) return "CodePipeline + CodeBuild";
  if (recs.find((r) => r.serviceId === "cloud-build")) return "Cloud Build";
  return "GitHub Actions";
}

function pickDeployTarget(recs: ServiceRecommendation[]): string | null {
  // Prefer compute services in this order.
  const order = ["cloud-run", "ecs", "fargate", "app-runner", "lambda", "cloud-functions", "gke", "eks", "ec2", "gce"];
  for (const id of order) {
    if (recs.find((r) => r.serviceId === id)) return id;
  }
  return null;
}

function isContainerTarget(target: string | null): boolean {
  if (!target) return false;
  return ["ecs", "fargate", "cloud-run", "gke", "eks", "app-runner"].includes(target);
}

function pickRegistry(recs: ServiceRecommendation[]): string | null {
  if (recs.find((r) => r.serviceId === "ecr")) return "ecr";
  if (recs.find((r) => r.serviceId === "artifact-registry")) return "artifact-registry";
  return null;
}
