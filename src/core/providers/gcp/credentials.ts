import { execSync, spawnSync } from "child_process";
import { existsSync } from "fs";
import type { CloudProvider } from "../provider";

export class GCPProvider implements CloudProvider {
  name(): string { return "gcp"; }
  displayName(): string { return "Google Cloud Platform"; }

  /** Check if gcloud CLI is installed */
  isGcloudInstalled(): boolean {
    try {
      execSync("gcloud version --format=json", { encoding: "utf-8", stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /** Get the currently authenticated account (if any) */
  getCurrentAccount(): string | null {
    try {
      const output = execSync("gcloud auth list --filter=status:ACTIVE --format=value(account)", {
        encoding: "utf-8", stdio: "pipe",
      }).trim();
      return output || null;
    } catch {
      return null;
    }
  }

  /** Get the current project */
  getCurrentProject(): string | null {
    try {
      const output = execSync("gcloud config get-value project", {
        encoding: "utf-8", stdio: "pipe",
      }).trim();
      return output && output !== "(unset)" ? output : null;
    } catch {
      return null;
    }
  }

  /** Run gcloud auth login — opens browser for OAuth */
  login(email?: string): { success: boolean; account?: string; error?: string } {
    try {
      const args = ["auth", "login", "--brief", "--no-launch-browser"];
      if (email) args.push(`--account=${email}`);

      // Use spawnSync with inherited stdio so the user sees the auth URL and can interact
      const result = spawnSync("gcloud", args, {
        stdio: "inherit",
        shell: true,
        timeout: 120_000,
      });

      if (result.status !== 0) {
        return { success: false, error: `gcloud auth login exited with code ${result.status}` };
      }

      const account = this.getCurrentAccount();
      return { success: true, account: account || email };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Set the active GCP project */
  setProject(projectId: string): { success: boolean; error?: string } {
    try {
      execSync(`gcloud config set project ${projectId}`, {
        encoding: "utf-8", stdio: "pipe",
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Generate application-default credentials for SDK usage */
  setupApplicationDefaultCredentials(): { success: boolean; error?: string } {
    try {
      const result = spawnSync("gcloud", ["auth", "application-default", "login", "--no-launch-browser"], {
        stdio: "inherit",
        shell: true,
        timeout: 120_000,
      });

      if (result.status !== 0) {
        return { success: false, error: `ADC setup exited with code ${result.status}` };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Validate credentials by listing the project */
  async validateCredentials(): Promise<{ valid: boolean; identity?: string; error?: string }> {
    // Method 1: Check GOOGLE_APPLICATION_CREDENTIALS env var
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath && existsSync(credPath)) {
      const project = this.getCurrentProject();
      return { valid: true, identity: `Service account (${project || "no project set"})` };
    }

    // Method 2: Check gcloud CLI auth
    if (!this.isGcloudInstalled()) {
      return { valid: false, error: "gcloud CLI not installed. Install from https://cloud.google.com/sdk/docs/install" };
    }

    const account = this.getCurrentAccount();
    const project = this.getCurrentProject();

    if (account && project) {
      // Verify access by describing the project
      try {
        execSync(`gcloud projects describe ${project} --format=value(projectId)`, {
          encoding: "utf-8", stdio: "pipe",
        });
        return { valid: true, identity: `${account} (project: ${project})` };
      } catch {
        return { valid: false, error: `Authenticated as ${account} but cannot access project ${project}` };
      }
    }

    if (account && !project) {
      return { valid: false, error: `Authenticated as ${account} but no project set. Provide a project ID.` };
    }

    return { valid: false, error: "Not authenticated. Login required." };
  }

  getRegions(): { id: string; name: string }[] {
    return [
      { id: "us-central1", name: "US Central (Iowa)" },
      { id: "us-east1", name: "US East (South Carolina)" },
      { id: "us-west1", name: "US West (Oregon)" },
      { id: "europe-west1", name: "Europe West (Belgium)" },
      { id: "europe-west2", name: "Europe West (London)" },
      { id: "europe-west3", name: "Europe West (Frankfurt)" },
      { id: "asia-east1", name: "Asia East (Taiwan)" },
      { id: "asia-northeast1", name: "Asia Northeast (Tokyo)" },
      { id: "asia-southeast1", name: "Asia Southeast (Singapore)" },
      { id: "australia-southeast1", name: "Australia (Sydney)" },
    ];
  }
}
