"use client";

/**
 * Two-column AWS / GCP service grid. Each cell is a small bracketed
 * label; on hover, a faint underline and ember dot appear so the
 * grid feels reactive, not static.
 *
 * Numbers update if you add agents to the registry — keep this list
 * in sync with src/core/agents/agent-registry.ts.
 */

const AWS_BUCKETS: Array<{ category: string; services: string[] }> = [
  { category: "compute", services: ["ec2", "ecs", "lambda", "app-runner", "eks"] },
  { category: "data", services: ["rds", "dynamodb", "elasticache", "opensearch"] },
  { category: "network", services: ["vpc", "alb", "cloudfront", "route53", "api-gateway"] },
  { category: "ml + ai", services: ["bedrock"] },
  { category: "messaging", services: ["sqs", "eventbridge", "step-functions"] },
  { category: "storage", services: ["s3", "ecr"] },
  { category: "ops", services: ["iam", "cloudwatch", "secrets-manager", "cognito"] },
  { category: "ci/cd", services: ["codepipeline", "codebuild"] },
];

const GCP_BUCKETS: Array<{ category: string; services: string[] }> = [
  { category: "compute", services: ["cloud-run", "cloud-functions", "gce", "gke"] },
  { category: "data", services: ["cloud-sql", "firestore", "memorystore", "bigquery"] },
  { category: "network", services: ["vpc-gcp", "cloud-lb", "cloud-cdn"] },
  { category: "ml + ai", services: ["vertex-ai"] },
  { category: "messaging", services: ["pubsub", "cloud-tasks", "cloud-workflows"] },
  { category: "storage", services: ["gcs", "artifact-registry"] },
  { category: "ops", services: ["cloud-iam", "cloud-monitoring", "secret-manager"] },
  { category: "ci/cd", services: ["cloud-build"] },
];

export function CloudGrid() {
  const awsCount = AWS_BUCKETS.reduce((a, b) => a + b.services.length, 0);
  const gcpCount = GCP_BUCKETS.reduce((a, b) => a + b.services.length, 0);
  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-px md:bg-border">
      <ProviderColumn
        title="AWS"
        count={awsCount}
        buckets={AWS_BUCKETS}
        regionHint="us-east-1 / us-west-2 / eu-west-1"
      />
      <ProviderColumn
        title="GCP"
        count={gcpCount}
        buckets={GCP_BUCKETS}
        regionHint="us-central1 / europe-west1 / asia-east1"
      />
    </div>
  );
}

function ProviderColumn({
  title,
  count,
  buckets,
  regionHint,
}: {
  title: string;
  count: number;
  buckets: Array<{ category: string; services: string[] }>;
  regionHint: string;
}) {
  return (
    <div className="bg-cream p-6 md:p-8">
      <header className="mb-6 flex items-baseline justify-between border-b border-border pb-3">
        <div className="flex items-baseline gap-3">
          <h3 className="display-serif text-3xl tracking-tight">{title}</h3>
          <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            [ {count} agents ]
          </span>
        </div>
        <span className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
          {regionHint}
        </span>
      </header>

      <div className="space-y-5">
        {buckets.map((bucket) => (
          <div key={bucket.category}>
            <p className="mb-2 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
              · {bucket.category}
            </p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
              {bucket.services.map((s) => (
                <li
                  key={s}
                  className="group cursor-default text-xs text-foreground/80 hover:text-ink"
                >
                  <span className="text-muted-foreground/60">[</span>
                  <span className="px-0.5 group-hover:underline group-hover:underline-offset-4 group-hover:decoration-ember">
                    {s}
                  </span>
                  <span className="text-muted-foreground/60">]</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
