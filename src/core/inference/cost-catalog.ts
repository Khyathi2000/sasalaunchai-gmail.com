// Per-service cost ranges for the planning UI. Daily USD, low / typical /
// high. Numbers are rough order-of-magnitude estimates derived from the
// public on-demand pricing pages — meant for "is this a $5/day or $500/day
// service" sanity, not invoicing.
//
// "low"     = idle / minimal usage (free tier or close to it)
// "typical" = small production workload
// "high"    = production with real traffic; rough upper bound at ~10x typical

export interface ServiceCostRange {
  low: number;
  typical: number;
  high: number;
  notes?: string;
}

export const COST_CATALOG: Record<string, ServiceCostRange> = {
  // === AWS ===
  vpc: { low: 0, typical: 0, high: 0, notes: "VPC itself is free; NAT GW is ~$1/day" },
  iam: { low: 0, typical: 0, high: 0 },
  ec2: { low: 0.20, typical: 1.5, high: 15.0, notes: "t3.micro → t3.large" },
  ecs: { low: 0.30, typical: 2.5, high: 25.0, notes: "Fargate 0.25 vCPU → 4 vCPU x 24h" },
  fargate: { low: 0.30, typical: 2.5, high: 25.0 },
  lambda: { low: 0.0, typical: 0.50, high: 10.0, notes: "Free tier covers 1M req/mo" },
  rds: { low: 0.50, typical: 3.0, high: 50.0, notes: "db.t3.micro → db.r6g.large" },
  s3: { low: 0.02, typical: 0.50, high: 10.0, notes: "First 50TB at $0.023/GB/mo" },
  cloudfront: { low: 0.05, typical: 1.0, high: 20.0 },
  alb: { low: 0.55, typical: 0.80, high: 2.0, notes: "Base $0.0225/hr + LCU charges" },
  elasticache: { low: 0.40, typical: 1.5, high: 15.0, notes: "cache.t3.micro → cache.r6g.large" },
  sqs: { low: 0.0, typical: 0.10, high: 2.0, notes: "Free tier covers 1M req/mo" },
  sns: { low: 0.0, typical: 0.05, high: 1.0 },
  cloudwatch: { low: 0.05, typical: 0.50, high: 5.0, notes: "Logs storage + metrics" },
  route53: { low: 0.02, typical: 0.05, high: 0.50, notes: "$0.50/hosted zone/mo" },
  "secrets-manager": { low: 0.01, typical: 0.10, high: 1.0, notes: "$0.40/secret/mo + API calls" },
  ecr: { low: 0.05, typical: 0.20, high: 2.0, notes: "$0.10/GB/mo" },
  cognito: { low: 0.0, typical: 0.20, high: 5.0, notes: "Free up to 50k MAU" },
  "api-gateway": { low: 0.05, typical: 0.50, high: 10.0, notes: "$1/M req for HTTP API" },
  dynamodb: { low: 0.0, typical: 0.50, high: 20.0, notes: "On-demand: $1.25/M write, $0.25/M read" },
  codepipeline: { low: 0.03, typical: 0.10, high: 1.0, notes: "$1/active pipeline/mo + CodeBuild minutes" },
  codebuild: { low: 0.10, typical: 0.50, high: 5.0, notes: "$0.005/build minute" },
  eventbridge: { low: 0.0, typical: 0.10, high: 2.0 },
  "app-runner": { low: 0.30, typical: 2.0, high: 20.0 },
  opensearch: { low: 0.80, typical: 4.0, high: 40.0, notes: "t3.small.search → r6g.large.search" },
  "step-functions": { low: 0.0, typical: 0.10, high: 5.0, notes: "$25/M state transitions" },
  bedrock: { low: 0.0, typical: 1.0, high: 100.0, notes: "Pay per token; varies wildly by model" },
  eks: { low: 2.40, typical: 8.0, high: 100.0, notes: "$0.10/cluster/hr + worker nodes" },

  // === GCP ===
  "vpc-gcp": { low: 0, typical: 0, high: 0 },
  "cloud-iam": { low: 0, typical: 0, high: 0 },
  gce: { low: 0.10, typical: 1.5, high: 15.0, notes: "e2-micro → e2-standard-4" },
  "cloud-run": { low: 0.0, typical: 0.50, high: 10.0, notes: "Free tier covers 2M req/mo" },
  "cloud-functions": { low: 0.0, typical: 0.20, high: 5.0 },
  "cloud-sql": { low: 0.50, typical: 3.0, high: 50.0, notes: "db-f1-micro → db-n1-standard-2" },
  firestore: { low: 0.0, typical: 0.50, high: 20.0, notes: "Free tier 50k reads + 20k writes/day" },
  gcs: { low: 0.02, typical: 0.50, high: 10.0, notes: "Standard $0.020/GB/mo" },
  "cloud-cdn": { low: 0.05, typical: 1.0, high: 20.0 },
  "cloud-lb": { low: 0.50, typical: 1.0, high: 5.0, notes: "$0.025/hr forwarding rule" },
  memorystore: { low: 0.40, typical: 2.0, high: 20.0, notes: "Basic 1GB → Standard HA 5GB" },
  pubsub: { low: 0.0, typical: 0.10, high: 2.0, notes: "$40/TB messages" },
  "artifact-registry": { low: 0.05, typical: 0.20, high: 2.0 },
  "secret-manager": { low: 0.01, typical: 0.10, high: 1.0, notes: "$0.06/active secret/mo" },
  "cloud-monitoring": { low: 0.0, typical: 0.20, high: 5.0, notes: "Free for first 150 MiB ingested" },
  "cloud-build": { low: 0.0, typical: 0.30, high: 5.0, notes: "$0.003/build minute after free tier" },
  bigquery: { low: 0.05, typical: 1.0, high: 100.0, notes: "$5/TB queried; storage cheap" },
  gke: { low: 1.50, typical: 5.0, high: 50.0, notes: "Autopilot ~$0.10/vCPU/hr" },
  "vertex-ai": { low: 0.10, typical: 2.0, high: 100.0 },
  "cloud-tasks": { low: 0.0, typical: 0.05, high: 1.0 },
  "cloud-workflows": { low: 0.0, typical: 0.10, high: 2.0 },
};

export interface ServiceCostEstimate {
  serviceId: string;
  range: ServiceCostRange;
  category?: string;
}

export function getCostRange(serviceId: string): ServiceCostRange {
  return COST_CATALOG[serviceId] ?? { low: 0, typical: 0.10, high: 1.0 };
}

export interface ProviderCostEstimate {
  serviceCount: number;
  totalLow: number;
  totalTypical: number;
  totalHigh: number;
  byService: ServiceCostEstimate[];
}

/** Sum cost ranges across a list of recommended services. */
export function estimateProviderCost(serviceIds: string[]): ProviderCostEstimate {
  const byService = serviceIds.map((id) => ({
    serviceId: id,
    range: getCostRange(id),
  }));
  return {
    serviceCount: serviceIds.length,
    totalLow: round2(byService.reduce((a, s) => a + s.range.low, 0)),
    totalTypical: round2(byService.reduce((a, s) => a + s.range.typical, 0)),
    totalHigh: round2(byService.reduce((a, s) => a + s.range.high, 0)),
    byService,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
