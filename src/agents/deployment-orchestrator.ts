import type { ServiceRecommendation, AgentOutput } from "../types/cloud.js";
import type { DeploymentPlan } from "../types/plan.js";
import { MessageBus } from "./message-bus.js";
import { DeploymentAgent, type LifecycleState } from "./agent-base.js";
import { createAgent } from "./agent-registry.js";
import { buildDependencyOrder } from "../inference/inference-engine.js";
import { applyDeployment, isTerraformAvailable } from "./terraform-runner.js";
import { log } from "../utils/logger.js";
import { join } from "path";
import { mkdirSync } from "fs";

export interface DeploymentResult {
  success: boolean;
  agents: AgentOutput[];
  totalDuration: number;
  error?: string;
}

export interface ServiceLifecycleResult {
  serviceId: string;
  success: boolean;
  state: LifecycleState;
  error?: string;
}

export class DeploymentOrchestrator {
  private agents: Map<string, DeploymentAgent> = new Map();
  private lifecycleStates: Map<string, LifecycleState> = new Map();
  private bus: MessageBus;
  private plan: DeploymentPlan;
  private recommendations: ServiceRecommendation[];

  constructor(plan: DeploymentPlan, recommendations: ServiceRecommendation[]) {
    this.plan = plan;
    this.recommendations = recommendations;
    this.bus = new MessageBus();
  }

  async execute(): Promise<DeploymentResult> {
    const startTime = Date.now();
    log.info(`Deployment orchestrator starting with ${this.recommendations.length} services`);

    // Create agents for each recommended service
    for (const rec of this.recommendations) {
      const agent = createAgent(rec);
      if (agent) {
        const artifactDir = join(this.plan.workDir, "artifacts", "terraform", rec.provider, rec.serviceId);
        mkdirSync(artifactDir, { recursive: true });

        agent.initialize({
          plan: this.plan,
          recommendation: rec,
          bus: this.bus,
          artifactDir,
        });
        this.agents.set(rec.serviceId, agent);
        log.info(`Agent spawned: ${agent.id} (${rec.serviceName})`);
      } else {
        log.warn(`No agent implementation for service: ${rec.serviceId}`);
      }
    }

    // Build dependency-ordered tiers
    const tiers = buildDependencyOrder(this.recommendations);
    log.info(`Execution plan: ${tiers.length} tiers`);

    // Execute tier by tier (parallel within each tier)
    const agentOutputs: AgentOutput[] = [];

    for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
      const tier = tiers[tierIdx];
      const tierAgents = tier.map(id => this.agents.get(id)).filter((a): a is DeploymentAgent => a !== undefined);

      if (tierAgents.length === 0) continue;

      log.info(`Tier ${tierIdx + 1}: ${tierAgents.map(a => a.serviceName).join(", ")}`);

      // Run all agents in this tier in parallel
      const results = await Promise.allSettled(
        tierAgents.map(agent => agent.run())
      );

      // Collect results
      let tierFailed = false;
      for (let i = 0; i < tierAgents.length; i++) {
        const agent = tierAgents[i];
        const result = results[i];

        const output: AgentOutput = {
          agentId: agent.id,
          outputs: agent.outputs,
          status: agent.status,
          logs: agent.logs,
          startedAt: agent.startedAt,
          completedAt: agent.completedAt,
        };

        if (result.status === "rejected") {
          output.status = "error";
          output.error = result.reason?.message ?? String(result.reason);
          tierFailed = true;
        } else if (!result.value.success) {
          output.error = result.value.error;
          tierFailed = true;
        }

        agentOutputs.push(output);
      }

      if (tierFailed) {
        log.error(`Tier ${tierIdx + 1} failed. Stopping deployment.`);
        return {
          success: false,
          agents: agentOutputs,
          totalDuration: Date.now() - startTime,
          error: `Deployment failed at tier ${tierIdx + 1}`,
        };
      }
    }

    // If apply mode is on, merge per-agent .tf files into a single stack
    // and run terraform init+apply.
    if (this.plan.applyMode) {
      const tfAvailable = await isTerraformAvailable();
      if (!tfAvailable) {
        const err = "terraform binary not found on PATH; cannot apply. Artifacts written to disk.";
        log.error(err);
        this.bus.publishError("terraform", err);
        return {
          success: false,
          agents: agentOutputs,
          totalDuration: Date.now() - startTime,
          error: err,
        };
      }

      log.info("All provision phases done. Running terraform apply...");
      const tfResult = await applyDeployment(this.plan, this.recommendations, this.bus);
      if (!tfResult.success) {
        return {
          success: false,
          agents: agentOutputs,
          totalDuration: Date.now() - startTime,
          error: tfResult.error ?? "terraform apply failed",
        };
      }
    }

    log.success("All agents completed successfully");
    for (const id of this.agents.keys()) this.lifecycleStates.set(id, "running");
    return {
      success: true,
      agents: agentOutputs,
      totalDuration: Date.now() - startTime,
    };
  }

  async rollback(): Promise<void> {
    log.warn("Rolling back deployment...");
    const agents = Array.from(this.agents.values()).reverse();
    for (const agent of agents) {
      if (agent.status === "done" || agent.status === "error") {
        try {
          await agent.rollback();
        } catch (err) {
          log.error(`Rollback failed for ${agent.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    log.info("Rollback complete");
  }

  getBus(): MessageBus {
    return this.bus;
  }

  getAgents(): Map<string, DeploymentAgent> {
    return this.agents;
  }

  getAgent(serviceId: string): DeploymentAgent | undefined {
    return this.agents.get(serviceId);
  }

  getPlan(): DeploymentPlan {
    return this.plan;
  }

  getRecommendations(): ServiceRecommendation[] {
    return [...this.recommendations];
  }

  getLifecycleState(serviceId: string): LifecycleState | undefined {
    return this.lifecycleStates.get(serviceId);
  }

  getLifecycleStates(): Map<string, LifecycleState> {
    return new Map(this.lifecycleStates);
  }

  setLifecycleState(serviceId: string, state: LifecycleState): void {
    this.lifecycleStates.set(serviceId, state);
  }

  private getRunningDependents(serviceId: string): string[] {
    const dependents: string[] = [];
    for (const rec of this.recommendations) {
      if (rec.dependsOn.includes(serviceId)) {
        const depState = this.lifecycleStates.get(rec.serviceId);
        if (depState !== "destroyed") dependents.push(rec.serviceId);
      }
    }
    return dependents;
  }

  async destroyService(serviceId: string): Promise<ServiceLifecycleResult> {
    const agent = this.agents.get(serviceId);
    if (!agent) {
      return { serviceId, success: false, state: "destroyed", error: `No agent for ${serviceId}` };
    }

    const dependents = this.getRunningDependents(serviceId);
    if (dependents.length > 0) {
      const error = `Cannot destroy ${serviceId}: still has dependents [${dependents.join(", ")}]. Destroy them first.`;
      this.bus.publishError(agent.id, error);
      return { serviceId, success: false, state: this.lifecycleStates.get(serviceId) ?? "running", error };
    }

    const result = await agent.destroy();
    const newState: LifecycleState = result.success ? "destroyed" : (this.lifecycleStates.get(serviceId) ?? "running");
    this.lifecycleStates.set(serviceId, newState);
    return { serviceId, success: result.success, state: newState, error: result.error };
  }

  async stopService(serviceId: string): Promise<ServiceLifecycleResult> {
    const agent = this.agents.get(serviceId);
    if (!agent) {
      return { serviceId, success: false, state: "destroyed", error: `No agent for ${serviceId}` };
    }
    const result = await agent.stop();
    const newState: LifecycleState = result.success ? "stopped" : (this.lifecycleStates.get(serviceId) ?? "running");
    this.lifecycleStates.set(serviceId, newState);
    return { serviceId, success: result.success, state: newState, error: result.error };
  }

  async startService(serviceId: string): Promise<ServiceLifecycleResult> {
    const agent = this.agents.get(serviceId);
    if (!agent) {
      return { serviceId, success: false, state: "destroyed", error: `No agent for ${serviceId}` };
    }
    const result = await agent.start();
    const newState: LifecycleState = result.success ? "running" : (this.lifecycleStates.get(serviceId) ?? "stopped");
    this.lifecycleStates.set(serviceId, newState);
    return { serviceId, success: result.success, state: newState, error: result.error };
  }

  async destroyAll(): Promise<ServiceLifecycleResult[]> {
    log.warn("Destroying all services in reverse dependency order...");
    const tiers = buildDependencyOrder(this.recommendations);
    const results: ServiceLifecycleResult[] = [];

    for (let i = tiers.length - 1; i >= 0; i--) {
      const tier = tiers[i];
      const tierResults = await Promise.all(
        tier.map(async (sid) => {
          const agent = this.agents.get(sid);
          if (!agent) return { serviceId: sid, success: true, state: "destroyed" as LifecycleState };
          if (this.lifecycleStates.get(sid) === "destroyed") {
            return { serviceId: sid, success: true, state: "destroyed" as LifecycleState };
          }
          const r = await agent.destroy();
          const newState: LifecycleState = r.success ? "destroyed" : (this.lifecycleStates.get(sid) ?? "running");
          this.lifecycleStates.set(sid, newState);
          return { serviceId: sid, success: r.success, state: newState, error: r.error };
        })
      );
      results.push(...tierResults);
    }

    return results;
  }
}
