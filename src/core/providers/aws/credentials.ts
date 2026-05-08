import { existsSync } from "fs";
import { join } from "path";
import type { CloudProvider } from "../provider";

export class AWSProvider implements CloudProvider {
  name(): string { return "aws"; }
  displayName(): string { return "Amazon Web Services"; }

  async validateCredentials(): Promise<{ valid: boolean; identity?: string; error?: string }> {
    // Check environment variables
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKey && secretKey) {
      // Try to validate using STS
      try {
        const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
        const client = new STSClient({ region: process.env.AWS_REGION || "us-east-1" });
        const response = await client.send(new GetCallerIdentityCommand({}));
        return { valid: true, identity: response.Arn };
      } catch (error) {
        return { valid: false, error: `STS validation failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    }

    // Check for ~/.aws/credentials
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const credFile = join(home, ".aws", "credentials");
    if (existsSync(credFile)) {
      return { valid: true, identity: "AWS credentials file found" };
    }

    return { valid: false, error: "No AWS credentials found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or configure ~/.aws/credentials" };
  }

  getRegions(): { id: string; name: string }[] {
    return [
      { id: "us-east-1", name: "US East (N. Virginia)" },
      { id: "us-east-2", name: "US East (Ohio)" },
      { id: "us-west-1", name: "US West (N. California)" },
      { id: "us-west-2", name: "US West (Oregon)" },
      { id: "eu-central-1", name: "EU (Frankfurt)" },
      { id: "eu-west-1", name: "EU (Ireland)" },
      { id: "eu-west-2", name: "EU (London)" },
      { id: "ap-northeast-1", name: "Asia Pacific (Tokyo)" },
      { id: "ap-southeast-1", name: "Asia Pacific (Singapore)" },
      { id: "ap-southeast-2", name: "Asia Pacific (Sydney)" },
      { id: "sa-east-1", name: "South America (Sao Paulo)" },
      { id: "ca-central-1", name: "Canada (Central)" },
    ];
  }
}
