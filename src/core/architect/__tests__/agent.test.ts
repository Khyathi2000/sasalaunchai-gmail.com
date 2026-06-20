import { describe, it, expect, beforeEach } from "vitest";
import { _setClientForTest, runArchitectTurn } from "../agent.js";
import type { ArchitectState } from "../tools.js";

interface FakeMessageCreateInput {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  tools?: unknown;
}

interface FakeContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface FakeResponse {
  content: FakeContentBlock[];
  stop_reason: string;
}

function fakeClient(responder: (input: FakeMessageCreateInput, callIdx: number) => FakeResponse) {
  let calls = 0;
  return {
    messages: {
      create: async (input: FakeMessageCreateInput) => {
        const r = responder(input, calls);
        calls += 1;
        return r as unknown;
      },
    },
  };
}

const initialState: ArchitectState = {
  provider: "aws",
  region: "us-east-1",
  recommendations: [
    {
      serviceId: "vpc",
      serviceName: "VPC",
      category: "networking",
      provider: "aws",
      reason: "x",
      confidence: "high",
      config: {},
      dependsOn: [],
    },
    {
      serviceId: "ecs",
      serviceName: "ECS",
      category: "compute",
      provider: "aws",
      reason: "x",
      confidence: "high",
      config: {},
      dependsOn: ["vpc"],
    },
  ],
};

beforeEach(() => {
  _setClientForTest(null);
});

describe("runArchitectTurn", () => {
  it("returns a plain reply when Claude makes no tool call", async () => {
    _setClientForTest(
      fakeClient(() => ({
        content: [{ type: "text", text: "Looks good, no changes needed." }],
        stop_reason: "end_turn",
      })) as never,
    );
    const result = await runArchitectTurn({
      state: initialState,
      history: [],
      userMessage: "is my architecture ok?",
      mode: "pre-deploy",
    });
    expect(result.reply).toMatch(/no changes/i);
    expect(result.mutations).toHaveLength(0);
    expect(result.state.recommendations).toEqual(initialState.recommendations);
  });

  it("applies an add_service tool call", async () => {
    _setClientForTest(
      fakeClient((_, idx) => {
        if (idx === 0) {
          return {
            content: [
              {
                type: "tool_use",
                id: "tu_1",
                name: "add_service",
                input: {
                  serviceId: "elasticache",
                  serviceName: "ElastiCache",
                  provider: "aws",
                  category: "cache",
                  reason: "user asked for redis",
                  dependsOn: ["vpc"],
                },
              },
            ],
            stop_reason: "tool_use",
          };
        }
        return {
          content: [{ type: "text", text: "Added ElastiCache for caching." }],
          stop_reason: "end_turn",
        };
      }) as never,
    );
    const result = await runArchitectTurn({
      state: initialState,
      history: [],
      userMessage: "add a redis cache",
      mode: "pre-deploy",
    });
    expect(result.mutations).toHaveLength(1);
    expect(result.mutations[0].tool).toBe("add_service");
    expect(result.state.recommendations).toHaveLength(3);
    expect(result.state.recommendations.find((r) => r.serviceId === "elasticache")).toBeDefined();
    expect(result.reply).toMatch(/added/i);
  });

  it("applies a swap_service tool call and rewires deps", async () => {
    _setClientForTest(
      fakeClient((_, idx) => {
        if (idx === 0) {
          return {
            content: [
              {
                type: "tool_use",
                id: "tu_2",
                name: "swap_service",
                input: {
                  fromServiceId: "ecs",
                  toServiceId: "app-runner",
                  toServiceName: "App Runner",
                  provider: "aws",
                  category: "compute",
                  reason: "simpler",
                },
              },
            ],
            stop_reason: "tool_use",
          };
        }
        return { content: [{ type: "text", text: "Swapped." }], stop_reason: "end_turn" };
      }) as never,
    );
    const result = await runArchitectTurn({
      state: initialState,
      history: [],
      userMessage: "use app runner instead",
      mode: "pre-deploy",
    });
    expect(result.state.recommendations.find((r) => r.serviceId === "ecs")).toBeUndefined();
    expect(result.state.recommendations.find((r) => r.serviceId === "app-runner")).toBeDefined();
  });

  it("caps the tool-use loop and still returns when Claude keeps calling tools", async () => {
    // Claude returns tool_use forever — agent must stop.
    _setClientForTest(
      fakeClient(() => ({
        content: [
          {
            type: "tool_use",
            id: "tu_loop",
            name: "set_region",
            input: { region: "us-west-2", reason: "loop" },
          },
        ],
        stop_reason: "tool_use",
      })) as never,
    );
    const result = await runArchitectTurn({
      state: initialState,
      history: [],
      userMessage: "loop",
      mode: "pre-deploy",
    });
    // Should have stopped at the cap (5 turns).
    expect(result.mutations.length).toBeLessThanOrEqual(5);
    expect(result.mutations.length).toBeGreaterThan(0);
  });

  it("post-deploy mode exposes the post-deploy tool set", async () => {
    let toolNames: string[] = [];
    _setClientForTest(
      fakeClient((input) => {
        if (Array.isArray(input.tools)) {
          toolNames = (input.tools as Array<{ name: string }>).map((t) => t.name);
        }
        return {
          content: [{ type: "text", text: "noop" }],
          stop_reason: "end_turn",
        };
      }) as never,
    );
    await runArchitectTurn({
      state: initialState,
      history: [],
      userMessage: "scale up",
      mode: "post-deploy",
    });
    expect(toolNames).toContain("scale_service");
    expect(toolNames).toContain("change_region");
  });
});
