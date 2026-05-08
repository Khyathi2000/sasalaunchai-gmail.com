import type { ServiceRecommendation } from "../types/cloud";
import { DeploymentAgent } from "./agent-base";

// AWS Agents
import { VPCAgent } from "./agents/vpc-agent";
import { IAMAgent } from "./agents/iam-agent";
import { EC2Agent } from "./agents/ec2-agent";
import { ECSAgent } from "./agents/ecs-agent";
import { LambdaAgent } from "./agents/lambda-agent";
import { RDSAgent } from "./agents/rds-agent";
import { S3Agent } from "./agents/s3-agent";
import { CloudFrontAgent } from "./agents/cloudfront-agent";
import { ElastiCacheAgent } from "./agents/elasticache-agent";
import { SQSAgent } from "./agents/sqs-agent";
import { ALBAgent } from "./agents/alb-agent";
import { Route53Agent } from "./agents/route53-agent";
import { ECRAgent } from "./agents/ecr-agent";
import { CloudWatchAgent } from "./agents/cloudwatch-agent";
import { SecretsManagerAgent } from "./agents/secrets-manager-agent";
import { DynamoDBAgent } from "./agents/dynamodb-agent";
import { ApiGatewayAgent } from "./agents/api-gateway-agent";
import { CognitoAgent } from "./agents/cognito-agent";
import { EventBridgeAgent } from "./agents/eventbridge-agent";
import { AppRunnerAgent } from "./agents/app-runner-agent";
import { OpenSearchAgent } from "./agents/opensearch-agent";
import { StepFunctionsAgent } from "./agents/step-functions-agent";

// GCP Agents
import { VPCGCPAgent } from "./agents/vpc-gcp-agent";
import { CloudIAMAgent } from "./agents/cloud-iam-agent";
import { CloudRunAgent } from "./agents/cloud-run-agent";
import { CloudFunctionsAgent } from "./agents/cloud-functions-agent";
import { GCEAgent } from "./agents/gce-agent";
import { CloudSQLAgent } from "./agents/cloud-sql-agent";
import { FirestoreAgent } from "./agents/firestore-agent";
import { GCSAgent } from "./agents/gcs-agent";
import { CloudCDNAgent } from "./agents/cloud-cdn-agent";
import { CloudLBAgent } from "./agents/cloud-lb-agent";
import { MemorystoreAgent } from "./agents/memorystore-agent";
import { PubSubAgent } from "./agents/pubsub-agent";
import { ArtifactRegistryAgent } from "./agents/artifact-registry-agent";
import { SecretManagerGCPAgent } from "./agents/secret-manager-agent";
import { CloudMonitoringAgent } from "./agents/cloud-monitoring-agent";
import { CloudBuildAgent } from "./agents/cloud-build-agent";
import { BigQueryAgent } from "./agents/bigquery-agent";
import { GKEAgent } from "./agents/gke-agent";
import { VertexAIAgent } from "./agents/vertex-ai-agent";
import { CloudTasksAgent } from "./agents/cloud-tasks-agent";
import { CloudWorkflowsAgent } from "./agents/cloud-workflows-agent";

type AgentConstructor = new (rec: ServiceRecommendation) => DeploymentAgent;

const awsAgentMap: Record<string, AgentConstructor> = {
  vpc: VPCAgent,
  iam: IAMAgent,
  ec2: EC2Agent,
  ecs: ECSAgent,
  lambda: LambdaAgent,
  rds: RDSAgent,
  s3: S3Agent,
  cloudfront: CloudFrontAgent,
  elasticache: ElastiCacheAgent,
  sqs: SQSAgent,
  alb: ALBAgent,
  route53: Route53Agent,
  ecr: ECRAgent,
  cloudwatch: CloudWatchAgent,
  "secrets-manager": SecretsManagerAgent,
  dynamodb: DynamoDBAgent,
  "api-gateway": ApiGatewayAgent,
  cognito: CognitoAgent,
  eventbridge: EventBridgeAgent,
  "app-runner": AppRunnerAgent,
  opensearch: OpenSearchAgent,
  "step-functions": StepFunctionsAgent,
};

const gcpAgentMap: Record<string, AgentConstructor> = {
  "vpc-gcp": VPCGCPAgent,
  "cloud-iam": CloudIAMAgent,
  "cloud-run": CloudRunAgent,
  "cloud-functions": CloudFunctionsAgent,
  "gce": GCEAgent,
  "cloud-sql": CloudSQLAgent,
  "firestore": FirestoreAgent,
  "gcs": GCSAgent,
  "cloud-cdn": CloudCDNAgent,
  "cloud-lb": CloudLBAgent,
  "memorystore": MemorystoreAgent,
  "pubsub": PubSubAgent,
  "artifact-registry": ArtifactRegistryAgent,
  "secret-manager": SecretManagerGCPAgent,
  "cloud-monitoring": CloudMonitoringAgent,
  "cloud-build": CloudBuildAgent,
  bigquery: BigQueryAgent,
  gke: GKEAgent,
  "vertex-ai": VertexAIAgent,
  "cloud-tasks": CloudTasksAgent,
  "cloud-workflows": CloudWorkflowsAgent,
};

const agentMap: Record<string, AgentConstructor> = {
  ...awsAgentMap,
  ...gcpAgentMap,
};

export function createAgent(recommendation: ServiceRecommendation): DeploymentAgent | null {
  const Constructor = agentMap[recommendation.serviceId];
  if (!Constructor) {
    return null;
  }
  return new Constructor(recommendation);
}

export function getAvailableAgentIds(provider?: string): string[] {
  if (provider === "aws") return Object.keys(awsAgentMap);
  if (provider === "gcp") return Object.keys(gcpAgentMap);
  return Object.keys(agentMap);
}
