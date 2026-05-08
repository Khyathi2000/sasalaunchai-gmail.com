import { EventEmitter } from "events";
import type { AgentMessage, OrchestratorEvent } from "../types/events";
import type { AgentStatusType } from "../types/cloud";

export class MessageBus extends EventEmitter {
  private messages: AgentMessage[] = [];

  publish(message: Omit<AgentMessage, "id" | "timestamp">): void {
    const full: AgentMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(full);
    this.emit("message", full);
    this.emit(`message:${message.type}`, full);
    if (message.to !== "*") {
      this.emit(`agent:${message.to}`, full);
    }
  }

  publishOutput(from: string, key: string, value: unknown): void {
    this.publish({
      from, to: "*", type: "output",
      payload: { key, value },
    });
  }

  publishStatus(from: string, status: AgentStatusType, message?: string): void {
    this.publish({
      from, to: "*", type: "status",
      payload: { status, message },
    });
  }

  publishError(from: string, error: string): void {
    this.publish({
      from, to: "*", type: "error",
      payload: { error },
    });
  }

  publishLog(from: string, message: string): void {
    this.publish({
      from, to: "*", type: "log",
      payload: { message },
    });
  }

  waitForOutput(agentId: string, key: string, timeoutMs: number = 300_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for output "${key}" from agent "${agentId}"`));
      }, timeoutMs);

      // Check existing messages first
      const existing = this.messages.find(
        m => m.from === agentId && m.type === "output" && m.payload.key === key
      );
      if (existing) {
        clearTimeout(timeout);
        resolve(existing.payload.value);
        return;
      }

      // Listen for future messages
      const handler = (msg: AgentMessage) => {
        if (msg.from === agentId && msg.type === "output" && msg.payload.key === key) {
          clearTimeout(timeout);
          this.removeListener("message:output", handler);
          resolve(msg.payload.value);
        }
      };
      this.on("message:output", handler);

      // Also listen for errors from the agent
      const errorHandler = (msg: AgentMessage) => {
        if (msg.from === agentId && msg.type === "error") {
          clearTimeout(timeout);
          this.removeListener("message:output", handler);
          this.removeListener("message:error", errorHandler);
          reject(new Error(`Agent "${agentId}" failed: ${msg.payload.error}`));
        }
      };
      this.on("message:error", errorHandler);
    });
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  getMessagesFrom(agentId: string): AgentMessage[] {
    return this.messages.filter(m => m.from === agentId);
  }

  getOutputs(agentId: string): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    for (const msg of this.messages) {
      if (msg.from === agentId && msg.type === "output" && msg.payload.key) {
        outputs[msg.payload.key] = msg.payload.value;
      }
    }
    return outputs;
  }
}

export const globalBus = new MessageBus();
