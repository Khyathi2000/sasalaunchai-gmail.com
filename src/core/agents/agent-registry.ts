import type { ServiceRecommendation } from "../types/cloud.js";
import { DeploymentAgent } from "./agent-base.js";

// AWS Agents
import { VPCAgent } from "./agents/vpc-agent.js";
import { IAMAgent } from "./agents/iam-agent.js";
import { EC2Agent } from "./agents/ec2-agent.js";
import { ECSAgent } from "./agents/ecs-agent.js";
import { LambdaAgent } from "./agents/lambda-agent.js";
import { RDSAgent } from "./agents/rds-agent.js";
import { S3Agent } from "./agents/s3-agent.js";
import { CloudFrontAgent } from "./agents/cloudfront-agent.js";
import { ElastiCacheAgent } from "./agents/elasticache-agent.js";
import { SQSAgent } from "./agents/sqs-agent.js";
import { ALBAgent } from "./agents/alb-agent.js";
import { Route53Agent } from "./agents/route53-agent.js";
import { ECRAgent } from "./agents/ecr-agent.js";
import { CloudWatchAgent } from "./agents/cloudwatch-agent.js";
import { SecretsManagerAgent } from "./agents/secrets-manager-agent.js";
import { DynamoDBAgent } from "./agents/dynamodb-agent.js";
import { ApiGatewayAgent } from "./agents/api-gateway-agent.js";
import { CognitoAgent } from "./agents/cognito-agent.js";
import { EventBridgeAgent } from "./agents/eventbridge-agent.js";
import { AppRunnerAgent } from "./agents/app-runner-agent.js";
import { OpenSearchAgent } from "./agents/opensearch-agent.js";
import { StepFunctionsAgent } from "./agents/step-functions-agent.js";

// GCP Agents
import { VPCGCPAgent } from "./agents/vpc-gcp-agent.js";
import { CloudIAMAgent } from "./agents/cloud-iam-agent.js";
import { CloudRunAgent } from "./agents/cloud-run-agent.js";
import { CloudFunctionsAgent } from "./agents/cloud-functions-agent.js";
import { GCEAgent } from "./agents/gce-agent.js";
import { CloudSQLAgent } from "./agents/cloud-sql-agent.js";
import { FirestoreAgent } from "./agents/firestore-agent.js";
import { GCSAgent } from "./agents/gcs-agent.js";
import { CloudCDNAgent } from "./agents/cloud-cdn-agent.js";
import { CloudLBAgent } from "./agents/cloud-lb-agent.js";
import { MemorystoreAgent } from "./agents/memorystore-agent.js";
import { PubSubAgent } from "./agents/pubsub-agent.js";
import { ArtifactRegistryAgent } from "./agents/artifact-registry-agent.js";
import { SecretManagerGCPAgent } from "./agents/secret-manager-agent.js";
import { CloudMonitoringAgent } from "./agents/cloud-monitoring-agent.js";
import { CloudBuildAgent } from "./agents/cloud-build-agent.js";
import { BigQueryAgent } from "./agents/bigquery-agent.js";
import { GKEAgent } from "./agents/gke-agent.js";
import { VertexAIAgent } from "./agents/vertex-ai-agent.js";
import { CloudTasksAgent } from "./agents/cloud-tasks-agent.js";
import { CloudWorkflowsAgent } from "./agents/cloud-workflows-agent.js";

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
