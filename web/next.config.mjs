import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: resolve(__dirname, ".."),
  experimental: {
    externalDir: true,
  },
  serverExternalPackages: [
    "@aws-sdk/client-sts",
    "@aws-sdk/client-cloudwatch",
    "@aws-sdk/client-cloudwatch-logs",
    "@aws-sdk/client-cost-explorer",
    "@anthropic-ai/sdk",
  ],
  webpack(config) {
    // CLI source uses NodeNext-style ".js" imports that point at ".ts" files.
    // Tell webpack to try .ts/.tsx when it sees a .js import.
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
