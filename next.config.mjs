/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@aws-sdk/client-sts",
    "@aws-sdk/client-cloudwatch",
    "@aws-sdk/client-cloudwatch-logs",
    "@aws-sdk/client-cost-explorer",
    "@anthropic-ai/sdk",
    "@google-cloud/firestore",
    "@google-cloud/pubsub",
    "@google-cloud/kms",
    "@google-cloud/billing",
    "@google-cloud/monitoring",
    "@electric-sql/pglite",
    "postgres",
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
