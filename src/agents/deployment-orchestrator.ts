import type { ServiceRecommendation, AgentOutput } from "../types/cloud.js";
import type { DeploymentPlan } from "../types/plan.js";
import { MessageBus } from "./message-bus.js";
import { DeploymentAgent } from "./agent-base.js";
import { createAgent } from "./agent-registry.js";
import { buildDependencyOrder } from "../inference/inference-engine.js";
import { log } from "../utils/logger.js";
import { join } from "path";
import { mkdirSync } from "fs";

export interface DeploymentResult {
  success: boolean;
  agents: AgentOutput[];
  totalDuration: number;
  error?: string;
}

export class DeploymentOrchestrator {
  private agents: Map<string, DeploymentAgent> = new Map();
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

    log.success("All agents completed successfully");
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
}
