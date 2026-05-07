// AWS account-wide discovery agent.
// Discovers all running AWS services, collects CloudWatch metrics, and fetches
// Cost Explorer billing data. Each discovery function is isolated — failures
// in one service do not block others.

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface AWSAccountInfo {
  accountId: string;
  arn: string;
  userId: string;
  region: string;
}

export type ResourceStatus = "running" | "stopped" | "available" | "active" | "unknown";

export interface AWSResource {
  id: string;
  name: string;
  service: string;
  type: string;
  status: ResourceStatus;
  region: string;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  discoveredAt: string;
}

export interface AWSMetrics {
  resourceId: string;
  service: string;
  cpu?: number;
  memory?: number;
  invocations?: number;
  errors?: number;
  latencyMs?: number;
  requestCount?: number;
  networkIn?: number;
  collectedAt: string;
}

export interface AWSCostData {
  periodStart: string;
  periodEnd: string;
  totalCost: number;
  dailyCost: number;
  currency: string;
  byService: { service: string; cost: number; dailyCost: number }[];
  collectedAt: string;
}

export type DiscoveryEvent =
  | { type: "account"; data: AWSAccountInfo }
  | { type: "resource"; data: AWSResource }
  | { type: "metrics"; data: AWSMetrics }
  | { type: "cost"; data: AWSCostData }
  | { type: "progress"; service: string; message: string }
  | { type: "error"; service: string; message: string };

export type DiscoveryEmit = (event: DiscoveryEvent) => void;


function credConfig(creds: AWSCredentials) {
  return {
    region: creds.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      ...(creds.sessionToken ? { sessionToken: creds.sessionToken } : {}),
    },
  };
}

export async function discoverAWSAccount(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  const account = await validateAndGetAccount(creds, emit);
  if (!account) return;

  await Promise.allSettled([
    discoverEC2(creds, emit),
    discoverLambda(creds, emit),
    discoverRDS(creds, emit),
    discoverS3(creds, emit),
    discoverECS(creds, emit),
    discoverDynamoDB(creds, emit),
    discoverSQS(creds, emit),
    discoverElastiCache(creds, emit),
  ]);

  await collectCosts(creds, emit);
}

async function validateAndGetAccount(
  creds: AWSCredentials,
  emit: DiscoveryEmit,
): Promise<AWSAccountInfo | null> {
  try {
    emit({ type: "progress", service: "sts", message: "Validating credentials..." });
    const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
    const client = new STSClient(credConfig(creds));
    const res = await client.send(new GetCallerIdentityCommand({}));
    const info: AWSAccountInfo = {
      accountId: res.Account ?? "unknown",
      arn: res.Arn ?? "unknown",
      userId: res.UserId ?? "unknown",
      region: creds.region,
    };
    emit({ type: "account", data: info });
    return info;
  } catch (err) {
    emit({
      type: "error",
      service: "sts",
      message: `Credential validation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return null;
  }
}

// ─── EC2 ─────────────────────────────────────────────────────────────────────

async function discoverEC2(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  try {
    emit({ type: "progress", service: "ec2", message: "Discovering EC2 instances..." });
    const { EC2Client, DescribeInstancesCommand } = await import("@aws-sdk/client-ec2");
    const client = new EC2Client(credConfig(creds));
    const res = await client.send(new DescribeInstancesCommand({ MaxResults: 100 }));

    for (const reservation of res.Reservations ?? []) {
      for (const instance of reservation.Instances ?? []) {
        const tags = Object.fromEntries((instance.Tags ?? []).map((t) => [t.Key ?? "", t.Value ?? ""]));
        emit({
          type: "resource",
          data: {
            id: instance.InstanceId ?? "unknown",
            name: tags["Name"] ?? instance.InstanceId ?? "unknown",
            service: "ec2",
            type: instance.InstanceType ?? "unknown",
            status: ec2State(instance.State?.Name),
            region: creds.region,
            tags,
            metadata: {
              launchTime: instance.LaunchTime?.toISOString(),
              publicIp: instance.PublicIpAddress,
              privateIp: instance.PrivateIpAddress,
              imageId: instance.ImageId,
              platform: instance.Platform ?? "linux",
              availabilityZone: instance.Placement?.AvailabilityZone,
            },
            discoveredAt: new Date().toISOString(),
          },
        });

        if (instance.InstanceId && instance.State?.Name === "running") {
          await collectEC2Metrics(creds, instance.InstanceId, emit).catch(() => null);
        }
      }
    }
  } catch {
    emit({ type: "progress", service: "ec2", message: "EC2: not available" });
  }
}

function ec2State(state?: string): ResourceStatus {
  if (state === "running") return "running";
  if (state === "stopped" || state === "stopping") return "stopped";
  return "unknown";
}

async function collectEC2Metrics(
  creds: AWSCredentials,
  instanceId: string,
  emit: DiscoveryEmit,
): Promise<void> {
  const { CloudWatchClient, GetMetricDataCommand } = await import("@aws-sdk/client-cloudwatch");
  const client = new CloudWatchClient(credConfig(creds));
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const res = await client.send(
    new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: "cpu",
          MetricStat: {
            Metric: {
              Namespace: "AWS/EC2",
              MetricName: "CPUUtilization",
              Dimensions: [{ Name: "InstanceId", Value: instanceId }],
            },
            Period: 300,
            Stat: "Average",
          },
        },
        {
          Id: "netIn",
          MetricStat: {
            Metric: {
              Namespace: "AWS/EC2",
              MetricName: "NetworkIn",
              Dimensions: [{ Name: "InstanceId", Value: instanceId }],
            },
            Period: 300,
            Stat: "Sum",
          },
        },
      ],
      StartTime: oneHourAgo,
      EndTime: now,
    }),
  );

  const cpu = res.MetricDataResults?.find((r) => r.Id === "cpu")?.Values?.[0];
  const netIn = res.MetricDataResults?.find((r) => r.Id === "netIn")?.Values?.[0];

  if (cpu !== undefined || netIn !== undefined) {
    emit({
      type: "metrics",
      data: {
        resourceId: instanceId,
        service: "ec2",
        cpu,
        networkIn: netIn,
        collectedAt: new Date().toISOString(),
      },
    });
  }
}

// ─── Lambda ──────────────────────────────────────────────────────────────────

async function discoverLambda(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  try {
    emit({ type: "progress", service: "lambda", message: "Discovering Lambda functions..." });
    const { LambdaClient, ListFunctionsCommand } = await import("@aws-sdk/client-lambda");
    const client = new LambdaClient(credConfig(creds));
    const res = await client.send(new ListFunctionsCommand({ MaxItems: 100 }));

    for (const fn of res.Functions ?? []) {
      emit({
        type: "resource",
        data: {
          id: fn.FunctionArn ?? fn.FunctionName ?? "unknown",
          name: fn.FunctionName ?? "unknown",
          service: "lambda",
          type: fn.Runtime ?? "unknown",
          status: "active",
          region: creds.region,
          tags: {},
          metadata: {
            handler: fn.Handler,
            codeSize: fn.CodeSize,
            memorySize: fn.MemorySize,
            timeout: fn.Timeout,
            lastModified: fn.LastModified,
            description: fn.Description,
            architecture: fn.Architectures?.[0],
          },
          discoveredAt: new Date().toISOString(),
        },
      });
    }

    if ((res.Functions?.length ?? 0) > 0) {
      await collectLambdaMetrics(creds, emit).catch(() => null);
    }
  } catch {
    emit({ type: "progress", service: "lambda", message: "Lambda: not available" });
  }
}

async function collectLambdaMetrics(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  const { CloudWatchClient, GetMetricDataCommand } = await import("@aws-sdk/client-cloudwatch");
  const client = new CloudWatchClient(credConfig(creds));
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const res = await client.send(
    new GetMetricDataCommand({
      MetricDataQueries: [
        {
          Id: "inv",
          MetricStat: {
            Metric: { Namespace: "AWS/Lambda", MetricName: "Invocations", Dimensions: [] },
            Period: 86400,
            Stat: "Sum",
          },
        },
        {
          Id: "errs",
          MetricStat: {
            Metric: { Namespace: "AWS/Lambda", MetricName: "Errors", Dimensions: [] },
            Period: 86400,
            Stat: "Sum",
          },
        },
        {
          Id: "dur",
          MetricStat: {
            Metric: { Namespace: "AWS/Lambda", MetricName: "Duration", Dimensions: [] },
            Period: 86400,
            Stat: "Average",
          },
        },
      ],
      StartTime: oneDayAgo,
      EndTime: now,
    }),
  );

  const inv = res.MetricDataResults?.find((r) => r.Id === "inv")?.Values?.[0];
  const errs = res.MetricDataResults?.find((r) => r.Id === "errs")?.Values?.[0];
  const dur = res.MetricDataResults?.find((r) => r.Id === "dur")?.Values?.[0];

  if (inv !== undefined || errs !== undefined) {
    emit({
      type: "metrics",
      data: {
        resourceId: "lambda:aggregate",
        service: "lambda",
        invocations: inv !== undefined ? Math.round(inv) : undefined,
        errors: errs !== undefined ? Math.round(errs) : undefined,
        latencyMs: dur,
        collectedAt: new Date().toISOString(),
      },
    });
  }
}

// ─── RDS ─────────────────────────────────────────────────────────────────────

async function discoverRDS(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  try {
    emit({ type: "progress", service: "rds", message: "Discovering RDS instances..." });
    const { RDSClient, DescribeDBInstancesCommand } = await import("@aws-sdk/client-rds");
    const client = new RDSClient(credConfig(creds));
    const res = await client.send(new DescribeDBInstancesCommand({}));

    for (const db of res.DBInstances ?? []) {
      const tags = Object.fromEntries((db.TagList ?? []).map((t) => [t.Key ?? "", t.Value ?? ""]));
      emit({
        type: "resource",
        data: {
          id: db.DBInstanceIdentifier ?? "unknown",
          name: db.DBInstanceIdentifier ?? "unknown",
          service: "rds",
          type: `${db.Engine}/${db.DBInstanceClass}`,
          status: rdsState(db.DBInstanceStatus),
          region: creds.region,
          tags,
          metadata: {
            engine: db.Engine,
            engineVersion: db.EngineVersion,
            instanceClass: db.DBInstanceClass,
            storageGb: db.AllocatedStorage,
            multiAZ: db.MultiAZ,
            endpoint: db.Endpoint?.Address,
            port: db.Endpoint?.Port,
          },
          discoveredAt: new Date().toISOString(),
        },
      });
    }
  } catch {
    emit({ type: "progress", service: "rds", message: "RDS: not available" });
  }
}

function rdsState(state?: string): ResourceStatus {
  if (state === "available") return "available";
  if (state === "stopped") return "stopped";
  if (state === "running") return "running";
  return "unknown";
}

// ─── S3 ──────────────────────────────────────────────────────────────────────

async function discoverS3(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  try {
    emit({ type: "progress", service: "s3", message: "Discovering S3 buckets..." });
    const { S3Client, ListBucketsCommand, GetBucketLocationCommand } = await import(
      "@aws-sdk/client-s3"
    );
    // ListBuckets is a global call; use us-east-1
    const client = new S3Client({ ...credConfig(creds), region: "us-east-1" });
    const res = await client.send(new ListBucketsCommand({}));

    for (const bucket of (res.Buckets ?? []).slice(0, 50)) {
      let bucketRegion = "us-east-1";
      try {
        const loc = await client.send(new GetBucketLocationCommand({ Bucket: bucket.Name! }));
        bucketRegion = loc.LocationConstraint ?? "us-east-1";
      } catch {
        // ignore per-bucket location errors
      }
      emit({
        type: "resource",
        data: {
          id: bucket.Name ?? "unknown",
          name: bucket.Name ?? "unknown",
          service: "s3",
          type: "bucket",
          status: "active",
          region: bucketRegion,
          tags: {},
          metadata: { creationDate: bucket.CreationDate?.toISOString(), region: bucketRegion },
          discoveredAt: new Date().toISOString(),
        },
      });
    }
  } catch {
    emit({ type: "progress", service: "s3", message: "S3: not available" });
  }
}

// ─── ECS ─────────────────────────────────────────────────────────────────────

async function discoverECS(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  try {
    emit({ type: "progress", service: "ecs", message: "Discovering ECS clusters..." });
    const {
      ECSClient,
      ListClustersCommand,
      DescribeClustersCommand,
      ListServicesCommand,
      DescribeServicesCommand,
    } = await import("@aws-sdk/client-ecs");
    const client = new ECSClient(credConfig(creds));

    const listRes = await client.send(new ListClustersCommand({}));
    const arns = listRes.clusterArns ?? [];
    if (arns.length === 0) return;

    const descRes = await client.send(new DescribeClustersCommand({ clusters: arns }));
    for (const cluster of descRes.clusters ?? []) {
      emit({
        type: "resource",
        data: {
          id: cluster.clusterArn ?? "unknown",
          name: cluster.clusterName ?? "unknown",
          service: "ecs",
          type: "cluster",
          status: cluster.status === "ACTIVE" ? "active" : "unknown",
          region: creds.region,
          tags: Object.fromEntries((cluster.tags ?? []).map((t) => [t.key ?? "", t.value ?? ""])),
          metadata: {
            runningTasks: cluster.runningTasksCount,
            activeServices: cluster.activeServicesCount,
            pendingTasks: cluster.pendingTasksCount,
          },
          discoveredAt: new Date().toISOString(),
        },
      });

      try {
        const svcList = await client.send(
          new ListServicesCommand({ cluster: cluster.clusterArn }),
        );
        const svcArns = svcList.serviceArns ?? [];
        if (svcArns.length > 0) {
          const svcDesc = await client.send(
            new DescribeServicesCommand({
              cluster: cluster.clusterArn,
              services: svcArns.slice(0, 10),
            }),
          );
          for (const svc of svcDesc.services ?? []) {
            emit({
              type: "resource",
              data: {
                id: svc.serviceArn ?? "unknown",
                name: svc.serviceName ?? "unknown",
                service: "ecs",
                type: "service",
                status: svc.status === "ACTIVE" ? "active" : "unknown",
                region: creds.region,
                tags: Object.fromEntries((svc.tags ?? []).map((t) => [t.key ?? "", t.value ?? ""])),
                metadata: {
                  taskDefinition: svc.taskDefinition,
                  runningCount: svc.runningCount,
                  desiredCount: svc.desiredCount,
                  cluster: cluster.clusterName,
                },
                discoveredAt: new Date().toISOString(),
              },
            });
          }
        }
      } catch {
        // ignore service listing errors per cluster
      }
    }
  } catch {
    emit({ type: "progress", service: "ecs", message: "ECS: not available" });
  }
}

// ─── DynamoDB ─────────────────────────────────────────────────────────────────

async function discoverDynamoDB(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  try {
    emit({ type: "progress", service: "dynamodb", message: "Discovering DynamoDB tables..." });
    const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = await import(
      "@aws-sdk/client-dynamodb"
    );
    const client = new DynamoDBClient(credConfig(creds));
    const listRes = await client.send(new ListTablesCommand({ Limit: 50 }));

    for (const tableName of listRes.TableNames ?? []) {
      try {
        const descRes = await client.send(new DescribeTableCommand({ TableName: tableName }));
        const table = descRes.Table;
        if (!table) continue;
        emit({
          type: "resource",
          data: {
            id: table.TableArn ?? tableName,
            name: tableName,
            service: "dynamodb",
            type: "table",
            status: table.TableStatus === "ACTIVE" ? "active" : "unknown",
            region: creds.region,
            tags: {},
            metadata: {
              itemCount: table.ItemCount,
              sizeBytes: table.TableSizeBytes,
              billingMode: table.BillingModeSummary?.BillingMode,
              readCapacity: table.ProvisionedThroughput?.ReadCapacityUnits,
              writeCapacity: table.ProvisionedThroughput?.WriteCapacityUnits,
            },
            discoveredAt: new Date().toISOString(),
          },
        });
      } catch {
        // ignore individual table errors
      }
    }
  } catch {
    emit({ type: "progress", service: "dynamodb", message: "DynamoDB: not available" });
  }
}

// ─── SQS ─────────────────────────────────────────────────────────────────────

async function discoverSQS(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  try {
    emit({ type: "progress", service: "sqs", message: "Discovering SQS queues..." });
    const { SQSClient, ListQueuesCommand, GetQueueAttributesCommand } = await import(
      "@aws-sdk/client-sqs"
    );
    const client = new SQSClient(credConfig(creds));
    const listRes = await client.send(new ListQueuesCommand({ MaxResults: 50 }));

    for (const queueUrl of listRes.QueueUrls ?? []) {
      const name = queueUrl.split("/").pop() ?? queueUrl;
      let meta: Record<string, unknown> = {};
      try {
        const attrRes = await client.send(
          new GetQueueAttributesCommand({
            QueueUrl: queueUrl,
            AttributeNames: [
              "ApproximateNumberOfMessages",
              "ApproximateNumberOfMessagesNotVisible",
            ],
          }),
        );
        const attrs = attrRes.Attributes ?? {};
        meta = {
          messageCount: parseInt(attrs["ApproximateNumberOfMessages"] ?? "0"),
          inFlightCount: parseInt(attrs["ApproximateNumberOfMessagesNotVisible"] ?? "0"),
        };
      } catch {
        // ignore attr fetch errors
      }
      emit({
        type: "resource",
        data: {
          id: queueUrl,
          name,
          service: "sqs",
          type: name.endsWith(".fifo") ? "fifo-queue" : "standard-queue",
          status: "active",
          region: creds.region,
          tags: {},
          metadata: meta,
          discoveredAt: new Date().toISOString(),
        },
      });
    }
  } catch {
    emit({ type: "progress", service: "sqs", message: "SQS: not available" });
  }
}

// ─── ElastiCache ─────────────────────────────────────────────────────────────

async function discoverElastiCache(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  try {
    emit({ type: "progress", service: "elasticache", message: "Discovering ElastiCache clusters..." });
    const { ElastiCacheClient, DescribeCacheClustersCommand } = await import(
      "@aws-sdk/client-elasticache"
    );
    const client = new ElastiCacheClient(credConfig(creds));
    const res = await client.send(new DescribeCacheClustersCommand({ ShowCacheNodeInfo: true }));

    for (const cluster of res.CacheClusters ?? []) {
      emit({
        type: "resource",
        data: {
          id: cluster.CacheClusterId ?? "unknown",
          name: cluster.CacheClusterId ?? "unknown",
          service: "elasticache",
          type: `${cluster.Engine}/${cluster.CacheNodeType}`,
          status: cluster.CacheClusterStatus === "available" ? "available" : "unknown",
          region: creds.region,
          tags: {},
          metadata: {
            engine: cluster.Engine,
            engineVersion: cluster.EngineVersion,
            nodeType: cluster.CacheNodeType,
            numNodes: cluster.NumCacheNodes,
            endpoint: cluster.CacheNodes?.[0]?.Endpoint?.Address,
          },
          discoveredAt: new Date().toISOString(),
        },
      });
    }
  } catch {
    emit({ type: "progress", service: "elasticache", message: "ElastiCache: not available" });
  }
}

// ─── Cost Explorer ───────────────────────────────────────────────────────────

async function collectCosts(creds: AWSCredentials, emit: DiscoveryEmit): Promise<void> {
  try {
    emit({ type: "progress", service: "cost-explorer", message: "Fetching billing data..." });
    const { CostExplorerClient, GetCostAndUsageCommand } = await import(
      "@aws-sdk/client-cost-explorer"
    );
    // Cost Explorer is always us-east-1
    const client = new CostExplorerClient({ ...credConfig(creds), region: "us-east-1" });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const res = await client.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: thirtyDaysAgo.toISOString().split("T")[0],
          End: now.toISOString().split("T")[0],
        },
        Granularity: "MONTHLY",
        Metrics: ["UnblendedCost"],
        GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
      }),
    );

    const byService: AWSCostData["byService"] = [];
    let total = 0;

    for (const group of res.ResultsByTime?.[0]?.Groups ?? []) {
      const service = group.Keys?.[0] ?? "Unknown";
      const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount ?? "0");
      if (amount > 0.001) {
        byService.push({
          service,
          cost: Math.round(amount * 100) / 100,
          dailyCost: Math.round((amount / 30) * 100) / 100,
        });
        total += amount;
      }
    }

    emit({
      type: "cost",
      data: {
        periodStart: thirtyDaysAgo.toISOString().split("T")[0],
        periodEnd: now.toISOString().split("T")[0],
        totalCost: Math.round(total * 100) / 100,
        dailyCost: Math.round((total / 30) * 100) / 100,
        currency: "USD",
        byService: byService.sort((a, b) => b.cost - a.cost),
        collectedAt: new Date().toISOString(),
      },
    });
  } catch {
    emit({ type: "progress", service: "cost-explorer", message: "Billing data not available" });
  }
}
