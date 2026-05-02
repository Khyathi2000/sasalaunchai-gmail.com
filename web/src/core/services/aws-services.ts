import type { Service } from "./service.js";

export const awsServices: Service[] = [
  { id: "vpc", name: "VPC", description: "Virtual private cloud for network isolation", category: "networking", provider: "aws" },
  { id: "ec2", name: "EC2", description: "Virtual machine instances", category: "compute", provider: "aws" },
  { id: "ecs", name: "ECS Fargate", description: "Serverless container orchestration", category: "orchestration", provider: "aws" },
  { id: "lambda", name: "Lambda", description: "Serverless functions", category: "serverless", provider: "aws" },
  { id: "rds", name: "RDS", description: "Managed relational database (PostgreSQL, MySQL)", category: "database", provider: "aws" },
  { id: "dynamodb", name: "DynamoDB", description: "Managed NoSQL key-value database", category: "database", provider: "aws" },
  { id: "s3", name: "S3", description: "Object storage for files and assets", category: "storage", provider: "aws" },
  { id: "cloudfront", name: "CloudFront", description: "Content delivery network", category: "cdn", provider: "aws" },
  { id: "alb", name: "ALB", description: "Application load balancer", category: "networking", provider: "aws" },
  { id: "route53", name: "Route 53", description: "DNS management and routing", category: "dns", provider: "aws" },
  { id: "elasticache", name: "ElastiCache", description: "Managed Redis or Memcached", category: "caching", provider: "aws" },
  { id: "sqs", name: "SQS", description: "Simple message queue service", category: "messaging", provider: "aws" },
  { id: "sns", name: "SNS", description: "Pub/sub notification service", category: "messaging", provider: "aws" },
  { id: "iam", name: "IAM", description: "Identity and access management", category: "auth", provider: "aws" },
  { id: "cognito", name: "Cognito", description: "User authentication and identity pools", category: "auth", provider: "aws" },
  { id: "cloudwatch", name: "CloudWatch", description: "Monitoring, logging, and alerting", category: "observability", provider: "aws" },
  { id: "ecr", name: "ECR", description: "Docker container image registry", category: "container-registry", provider: "aws" },
  { id: "secrets-manager", name: "Secrets Manager", description: "Secret storage and rotation", category: "secrets", provider: "aws" },
  { id: "api-gateway", name: "API Gateway", description: "Managed REST and WebSocket APIs", category: "networking", provider: "aws" },
  { id: "codepipeline", name: "CodePipeline", description: "CI/CD pipeline automation", category: "ci-cd", provider: "aws" },
];
