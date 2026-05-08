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
  ],
  turbopack: {},
};

export default nextConfig;
