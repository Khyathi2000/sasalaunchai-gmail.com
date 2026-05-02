import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { AgentStatusType } from "../types/cloud.js";
import type { LifecycleState } from "../agents/agent-base.js";

export interface DeploymentState {
  phase: string;
  startedAt: string;
  agents: Record<string, {
    status: AgentStatusType;
    state?: LifecycleState;
    outputs: Record<string, unknown>;
    startedAt?: string;
    completedAt?: string;
    error?: string;
  }>;
  completedAt?: string;
}

export class StateStore {
  private filePath: string;
  private state: DeploymentState;

  constructor(workDir: string) {
    this.filePath = join(workDir, "state.json");
    this.state = this.load();
  }

  private load(): DeploymentState {
    if (existsSync(this.filePath)) {
      return JSON.parse(readFileSync(this.filePath, "utf-8"));
    }
    return {
      phase: "init",
      startedAt: new Date().toISOString(),
      agents: {},
    };
  }

  save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  setPhase(phase: string): void {
    this.state.phase = phase;
    this.save();
  }

  setAgentStatus(agentId: string, status: AgentStatusType, outputs?: Record<string, unknown>): void {
    if (!this.state.agents[agentId]) {
      this.state.agents[agentId] = { status, outputs: {}, startedAt: new Date().toISOString() };
    }
    this.state.agents[agentId].status = status;
    if (outputs) this.state.agents[agentId].outputs = outputs;
    if (status === "done") {
      this.state.agents[agentId].completedAt = new Date().toISOString();
      this.state.agents[agentId].state = "running";
    }
    if (status === "error") {
      this.state.agents[agentId].completedAt = new Date().toISOString();
    }
    this.save();
  }

  setAgentLifecycleState(agentId: string, state: LifecycleState): void {
    if (!this.state.agents[agentId]) {
      this.state.agents[agentId] = { status: "idle", state, outputs: {}, startedAt: new Date().toISOString() };
    } else {
      this.state.agents[agentId].state = state;
    }
    this.save();
  }

  getAgentStatus(agentId: string): AgentStatusType | undefined {
    return this.state.agents[agentId]?.status;
  }

  getAgentLifecycleState(agentId: string): LifecycleState | undefined {
    return this.state.agents[agentId]?.state;
  }

  getState(): DeploymentState {
    return { ...this.state };
  }

  isComplete(): boolean {
    return this.state.completedAt !== undefined;
  }

  markComplete(): void {
    this.state.completedAt = new Date().toISOString();
    this.save();
  }
}
