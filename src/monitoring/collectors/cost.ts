export interface CostBreakdown {
  totalDaily: number;
  totalMonthly: number;
  byService: { serviceId: string; dailyCost: number; monthlyCost: number }[];
  currency: string;
  collectedAt: string;
}

// Estimated costs per service type (for planning, not billing)
const estimatedCosts: Record<string, number> = {
  vpc: 0,
  iam: 0,
  ec2: 0.50,      // t3.micro on-demand ~$0.50/day
  ecs: 0.80,      // Fargate 256/512 ~$0.80/day
  lambda: 0.05,   // Minimal usage
  rds: 1.20,      // db.t3.micro ~$1.20/day
  s3: 0.05,       // Minimal storage
  cloudfront: 0.10,
  alb: 0.70,      // ~$0.70/day
  elasticache: 0.70, // cache.t3.micro ~$0.70/day
  sqs: 0.02,
  sns: 0.01,
  cloudwatch: 0.10,
  route53: 0.02,
  "secrets-manager": 0.02,
  ecr: 0.10,
  cognito: 0.05,
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
