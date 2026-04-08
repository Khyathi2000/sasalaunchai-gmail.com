export interface CostBreakdown {
  totalDaily: number;
  totalMonthly: number;
  byService: { serviceId: string; dailyCost: number; monthlyCost: number }[];
  currency: string;
  collectedAt: string;
}

// Estimated costs per service type (for planning, not billing)
const estimatedCosts: Record<string, number> = {
  // AWS services
  vpc: 0,
  iam: 0,
  ec2: 0.50,           // t3.micro on-demand ~$0.50/day
  ecs: 0.80,           // Fargate 256/512 ~$0.80/day
  lambda: 0.05,        // Minimal usage
  rds: 1.20,           // db.t3.micro ~$1.20/day
  s3: 0.05,            // Minimal storage
  cloudfront: 0.10,
  alb: 0.70,           // ~$0.70/day
  elasticache: 0.70,   // cache.t3.micro ~$0.70/day
  sqs: 0.02,
  sns: 0.01,
  cloudwatch: 0.10,
  route53: 0.02,
  "secrets-manager": 0.02,
  ecr: 0.10,
  cognito: 0.05,
  "api-gateway": 0.12,
  dynamodb: 0.08,
  codepipeline: 0.30,

  // GCP services
  "vpc-gcp": 0,
  "cloud-iam": 0,
  "gce": 0.20,           // e2-micro ~$0.20/day (free tier eligible)
  "cloud-run": 0.50,     // Minimal usage ~$0.50/day
  "cloud-functions": 0.03, // Minimal invocations
  "cloud-sql": 1.00,     // db-f1-micro ~$1.00/day
  "firestore": 0.06,     // Minimal reads/writes
  "gcs": 0.04,           // Standard storage
  "cloud-cdn": 0.08,     // Minimal traffic
  "cloud-lb": 0.60,      // Forwarding rule ~$0.60/day
  "memorystore": 0.55,   // Basic 1GB ~$0.55/day
  "pubsub": 0.02,        // Minimal messages
  "artifact-registry": 0.05, // Minimal storage
  "secret-manager": 0.02,
  "cloud-monitoring": 0.05,  // Free tier covers most
};

export function estimateCosts(serviceIds: string[]): CostBreakdown {
  const byService = serviceIds.map(id => {
    const daily = estimatedCosts[id] ?? 0.10;
    return { serviceId: id, dailyCost: daily, monthlyCost: daily * 30 };
  });

  const totalDaily = byService.reduce((sum, s) => sum + s.dailyCost, 0);
  return {
    totalDaily: Math.round(totalDaily * 100) / 100,
    totalMonthly: Math.round(totalDaily * 30 * 100) / 100,
    byService,
    currency: "USD",
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Fetch real cost data from AWS Cost Explorer.
 * Falls back to estimates if credentials are unavailable.
 */
export async function fetchRealCosts(region: string): Promise<CostBreakdown | null> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }

  try {
    const { CostExplorerClient, GetCostAndUsageCommand } = await import("@aws-sdk/client-cost-explorer");
    const client = new CostExplorerClient({ region: "us-east-1" }); // Cost Explorer is global

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const response = await client.send(new GetCostAndUsageCommand({
      TimePeriod: {
        Start: thirtyDaysAgo.toISOString().split("T")[0],
        End: now.toISOString().split("T")[0],
      },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
      Filter: {
        Tags: {
          Key: "ManagedBy",
          Values: ["sasa-launch", "launch-platform"],
        },
      },
    }));

    const byService: CostBreakdown["byService"] = [];
    let totalMonthly = 0;

    for (const group of response.ResultsByTime?.[0]?.Groups || []) {
      const serviceName = group.Keys?.[0] || "Unknown";
      const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || "0");
      totalMonthly += amount;
      byService.push({
        serviceId: serviceName.toLowerCase().replace(/\s+/g, "-"),
        dailyCost: Math.round((amount / 30) * 100) / 100,
        monthlyCost: Math.round(amount * 100) / 100,
      });
    }

    return {
      totalDaily: Math.round((totalMonthly / 30) * 100) / 100,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      byService: byService.sort((a, b) => b.monthlyCost - a.monthlyCost),
      currency: "USD",
      collectedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
