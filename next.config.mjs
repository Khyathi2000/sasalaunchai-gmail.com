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
  webpack(config) {
    // Core source under src/core/ uses NodeNext-style ".js" imports that
    // point at ".ts" files. Tell webpack to try .ts/.tsx when it sees a .js import.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
