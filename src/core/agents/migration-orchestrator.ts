import type { ServiceRecommendation } from "../types/cloud";
import type { DeploymentPlan } from "../types/plan";
import { DeploymentOrchestrator, type DeploymentResult, type ServiceLifecycleResult } from "./deployment-orchestrator";
import { MessageBus } from "./message-bus";
import { log } from "../utils/logger";

export type MigrationPhase = "idle" | "target-deploying" | "target-running" | "decommissioning" | "complete" | "failed";

export interface MigrationStatus {
  phase: MigrationPhase;
  source: { provider: string; region: string };
  target: { provider: string; region: string };
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export class MigrationOrchestrator {
  private source: DeploymentOrchestrator;
  private target: DeploymentOrchestrator;
  private status: MigrationStatus;
  private bus: MessageBus;

  constructor(
    source: DeploymentOrchestrator,
    targetPlan: DeploymentPlan,
    targetRecommendations: ServiceRecommendation[],
  ) {
    this.source = source;
    this.target = new DeploymentOrchestrator(targetPlan, targetRecommendations);
    this.bus = new MessageBus();
    const sourcePlan = source.getPlan();
    this.status = {
      phase: "idle",
      source: { provider: sourcePlan.provider, region: sourcePlan.region },
      target: { provider: targetPlan.provider, region: targetPlan.region },
      startedAt: new Date().toISOString(),
    };
  }

  getStatus(): MigrationStatus {
    return { ...this.status };
  }

  getBus(): MessageBus {
    return this.bus;
  }

  getTargetBus(): MessageBus {
    return this.target.getBus();
  }

  getSource(): DeploymentOrchestrator {
    return this.source;
  }

  getTarget(): DeploymentOrchestrator {
    return this.target;
  }

  async startTarget(): Promise<DeploymentResult> {
    this.status.phase = "target-deploying";
    this.bus.publishStatus("migration", "deploying", `Deploying to ${this.status.target.provider}...`);
    log.info(`Migration: deploying to ${this.status.target.provider} (${this.status.target.region})`);

    try {
      const result = await this.target.execute();
      if (result.success) {
        this.status.phase = "target-running";
        this.bus.publishStatus("migration", "done", "Target deployment running; cutover ready");
      } else {
        this.status.phase = "failed";
        this.status.error = result.error;
        this.bus.publishError("migration", result.error ?? "Target deployment failed");
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.status.phase = "failed";
      this.status.error = errorMsg;
      this.bus.publishError("migration", errorMsg);
      throw err;
    }
  }

  async decommissionSource(): Promise<ServiceLifecycleResult[]> {
    if (this.status.phase !== "target-running") {
      throw new Error(`Cannot decommission source: target is in phase "${this.status.phase}"`);
    }
    this.status.phase = "decommissioning";
    this.bus.publishStatus("migration", "rolling-back", "Tearing down source deployment...");
    log.warn("Migration: decommissioning source deployment");

    const results = await this.source.destroyAll();
    const allOk = results.every((r) => r.success);

    this.status.phase = allOk ? "complete" : "failed";
    this.status.completedAt = new Date().toISOString();
    if (!allOk) {
      const errors = results.filter((r) => !r.success).map((r) => `${r.serviceId}: ${r.error}`).join("; ");
      this.status.error = errors;
      this.bus.publishError("migration", errors);
    } else {
      this.bus.publishStatus("migration", "done", "Migration complete");
    }
    return results;
  }
}
