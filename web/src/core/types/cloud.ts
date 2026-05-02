export type AgentStatusType =
  | "idle"
  | "provisioning"
  | "configuring"
  | "deploying"
  | "validating"
  | "done"
  | "error"
  | "rolling-back";

export interface ServiceRecommendation {
  serviceId: string;
  serviceName: string;
  category: string;
  provider: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  config: Record<string, unknown>;
  dependsOn: string[];
}

export interface AgentOutput {
  agentId: string;
  outputs: Record<string, unknown>;
  terraformDir?: string;
  status: AgentStatusType;
  logs: string[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
