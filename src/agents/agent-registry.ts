import type { ServiceRecommendation } from "../types/cloud.js";
import { DeploymentAgent } from "./agent-base.js";
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

type AgentConstructor = new (rec: ServiceRecommendation) => DeploymentAgent;

const agentMap: Record<string, AgentConstructor> = {
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
};

export function createAgent(recommendation: ServiceRecommendation): DeploymentAgent | null {
  const Constructor = agentMap[recommendation.serviceId];
  if (!Constructor) {
    // Return a generic agent for unmapped services
    return null;
  }
  return new Constructor(recommendation);
}

export function getAvailableAgentIds(): string[] {
  return Object.keys(agentMap);
}
