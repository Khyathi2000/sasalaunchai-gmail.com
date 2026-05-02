import type { AgentStatusType } from "./cloud.js";

export interface AgentMessage {
  id: string;
  from: string;
  to: string;  // agent ID or "*" for broadcast
  type: "output" | "request" | "status" | "error" | "log";
  payload: {
    key?: string;
    value?: unknown;
    status?: AgentStatusType;
    error?: string;
    message?: string;
  };
  timestamp: string;
}

export type OrchestratorEvent =
  | { type: "phase:start"; phase: string; message: string }
  | { type: "phase:complete"; phase: string }
  | { type: "agent:spawn"; agentId: string; serviceId: string }
  | { type: "agent:status"; agentId: string; status: AgentStatusType; message?: string }
  | { type: "agent:output"; agentId: string; key: string; value: unknown }
  | { type: "agent:error"; agentId: string; error: string }
  | { type: "agent:log"; agentId: string; message: string }
  | { type: "deploy:complete"; summary: Record<string, unknown> }
  | { type: "deploy:failed"; error: string }
  | { type: "error"; message: string };
