import type { AgentStatusType, ServiceRecommendation } from "../types/cloud.js";
import type { DeploymentPlan } from "../types/plan.js";
import { MessageBus } from "./message-bus.js";
import { log } from "../utils/logger.js";

export interface ProvisionResult {
  success: boolean;
  outputs: Record<string, unknown>;
  terraformDir?: string;
  error?: string;
}

export interface AgentContext {
  plan: DeploymentPlan;
  recommendation: ServiceRecommendation;
  bus: MessageBus;
  artifactDir: string;
}

export abstract class DeploymentAgent {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly dependencies: string[];
  status: AgentStatusType = "idle";
  outputs: Record<string, unknown> = {};
  logs: string[] = [];
  startedAt?: string;
  completedAt?: string;
  error?: string;

  protected bus!: MessageBus;
  protected context!: AgentContext;

  constructor(recommendation: ServiceRecommendation) {
    this.id = `${recommendation.serviceId}-agent`;
    this.serviceId = recommendation.serviceId;
    this.serviceName = recommendation.serviceName;
    this.dependencies = recommendation.dependsOn;
  }

  initialize(context: AgentContext): void {
    this.context = context;
    this.bus = context.bus;
  }

  protected setStatus(status: AgentStatusType, message?: string): void {
    this.status = status;
    this.bus.publishStatus(this.id, status, message);
    this.log(`Status: ${status}${message ? ` — ${message}` : ""}`);
  }

  protected log(message: string): void {
    const entry = `[${this.id}] ${message}`;
    this.logs.push(entry);
    this.bus.publishLog(this.id, message);
    log.debug(entry);
  }

  protected publishOutput(key: string, value: unknown): void {
    this.outputs[key] = value;
    this.bus.publishOutput(this.id, key, value);
    this.log(`Output: ${key} = ${JSON.stringify(value).slice(0, 100)}`);
  }

  protected async waitFor(agentId: string, outputKey: string): Promise<unknown> {
    this.log(`Waiting for ${agentId}.${outputKey}...`);
    const value = await this.bus.waitForOutput(`${agentId}-agent`, outputKey);
    this.log(`Received ${agentId}.${outputKey}`);
    return value;
  }

  async run(): Promise<ProvisionResult> {
    this.startedAt = new Date().toISOString();

    try {
      // Phase 1: Provision
      this.setStatus("provisioning", `Provisioning ${this.serviceName}...`);
      await this.provision();

      // Phase 2: Configure
      this.setStatus("configuring", `Configuring ${this.serviceName}...`);
      await this.configure();

      // Phase 3: Deploy (only in apply mode)
      if (this.context.plan.applyMode) {
        this.setStatus("deploying", `Deploying ${this.serviceName}...`);
        await this.deploy();
      }

      // Phase 4: Validate
      this.setStatus("validating", `Validating ${this.serviceName}...`);
      await this.validate();

      this.setStatus("done", `${this.serviceName} complete`);
      this.completedAt = new Date().toISOString();

      return { success: true, outputs: this.outputs, terraformDir: this.context.artifactDir };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error = errorMsg;
      this.setStatus("error", errorMsg);
      this.bus.publishError(this.id, errorMsg);
      this.completedAt = new Date().toISOString();

      return { success: false, outputs: this.outputs, error: errorMsg };
    }
  }

  async rollback(): Promise<void> {
    this.setStatus("rolling-back", `Rolling back ${this.serviceName}...`);
    try {
      await this.doRollback();
      this.log("Rollback complete");
    } catch (err) {
      this.log(`Rollback failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  protected getProjectName(): string {
    const source = this.context.plan.source;
    // Handle both forward and back slashes, remove trailing slashes
    const cleaned = source.replace(/\\/g, "/").replace(/\/+$/, "");
    const name = cleaned.split("/").pop() || "launch";
    // Clean for use in resource names: lowercase, alphanumeric + hyphens only
    return name.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase().slice(0, 40);
  }

  // Subclasses implement these
  protected abstract provision(): Promise<void>;
  protected abstract configure(): Promise<void>;
  protected abstract deploy(): Promise<void>;
  protected abstract validate(): Promise<void>;
  protected abstract doRollback(): Promise<void>;
}
