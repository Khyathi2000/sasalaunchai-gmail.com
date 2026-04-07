import { existsSync } from "fs";
import type { CloudProvider } from "../provider.js";

export class GCPProvider implements CloudProvider {
  name(): string { return "gcp"; }
  displayName(): string { return "Google Cloud Platform"; }

  async validateCredentials(): Promise<{ valid: boolean; identity?: string; error?: string }> {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath && existsSync(credPath)) {
      return { valid: true, identity: `Service account from ${credPath}` };
    }
    return { valid: false, error: "Set GOOGLE_APPLICATION_CREDENTIALS to your service account key file" };
  }

  getRegions(): { id: string; name: string }[] {
    return [
      { id: "us-central1", name: "US Central (Iowa)" },
      { id: "us-east1", name: "US East (South Carolina)" },
      { id: "us-west1", name: "US West (Oregon)" },
      { id: "europe-west1", name: "Europe West (Belgium)" },
      { id: "europe-west2", name: "Europe West (London)" },
      { id: "asia-east1", name: "Asia East (Taiwan)" },
      { id: "asia-northeast1", name: "Asia Northeast (Tokyo)" },
      { id: "asia-southeast1", name: "Asia Southeast (Singapore)" },
    ];
  }
}
