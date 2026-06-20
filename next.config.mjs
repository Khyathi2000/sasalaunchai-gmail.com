/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@aws-sdk/client-sts",
    "@aws-sdk/client-cloudwatch",
    "@aws-sdk/client-cloudwatch-logs",
    "@aws-sdk/client-cost-explorer",
    "@aws-sdk/client-ec2",
    "@aws-sdk/client-ecs",
    "@aws-sdk/client-lambda",
    "@aws-sdk/client-rds",
    "@aws-sdk/client-s3",
    "@aws-sdk/client-elasticache",
    "@aws-sdk/client-sqs",
    "@aws-sdk/client-dynamodb",
    "@anthropic-ai/sdk",
    "@google-cloud/firestore",
    "@google-cloud/pubsub",
    "@google-cloud/kms",
    "@google-cloud/billing",
    "@google-cloud/monitoring",
    "@electric-sql/pglite",
    "postgres",
  ],
  turbopack: {},
};

export default nextConfig;
