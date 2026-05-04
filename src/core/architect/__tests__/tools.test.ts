import { describe, it, expect } from "vitest";
import { applyTool, type ArchitectState } from "../tools.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

function rec(serviceId: string, deps: string[] = []): ServiceRecommendation {
  return {
    serviceId,
    serviceName: serviceId,
    category: "compute",
    provider: "aws",
    reason: "test",
    confidence: "high",
    config: {},
    dependsOn: deps,
  };
}

const baseState: ArchitectState = {
  provider: "aws",
  region: "us-east-1",
  recommendations: [rec("vpc"), rec("ecs", ["vpc"]), rec("rds", ["vpc"])],
};

describe("applyTool", () => {
  it("add_service appends a new recommendation", () => {
    const { state, mutation } = applyTool(baseState, "add_service", {
      serviceId: "elasticache",
      serviceName: "ElastiCache",
      provider: "aws",
      category: "cache",
      reason: "user asked for redis",
      dependsOn: ["vpc"],
    });
    expect(state.recommendations).toHaveLength(4);
    expect(state.recommendations.find((r) => r.serviceId === "elasticache")).toBeDefined();
    expect(mutation.tool).toBe("add_service");
    expect(mutation.before).toHaveLength(3);
    expect(mutation.after).toHaveLength(4);
  });

  it("add_service is idempotent", () => {
    const { state } = applyTool(baseState, "add_service", {
      serviceId: "ecs",
      serviceName: "ECS",
      provider: "aws",
      category: "compute",
      reason: "duplicate",
    });
    expect(state.recommendations).toHaveLength(3);
  });

  it("remove_service drops the named service", () => {
    const { state } = applyTool(baseState, "remove_service", {
      serviceId: "rds",
      reason: "use dynamodb instead",
    });
    expect(state.recommendations).toHaveLength(2);
    expect(state.recommendations.find((r) => r.serviceId === "rds")).toBeUndefined();
  });

  it("swap_service replaces and rewires dependencies", () => {
    const stateWithDep: ArchitectState = {
      ...baseState,
      recommendations: [
        rec("vpc"),
        rec("ecs", ["vpc"]),
        rec("alb", ["ecs"]), // ALB depends on ECS
      ],
    };
    const { state } = applyTool(stateWithDep, "swap_service", {
      fromServiceId: "ecs",
      toServiceId: "app-runner",
      toServiceName: "App Runner",
      provider: "aws",
      category: "compute",
      reason: "simpler ops",
    });
    expect(state.recommendations.find((r) => r.serviceId === "ecs")).toBeUndefined();
    expect(state.recommendations.find((r) => r.serviceId === "app-runner")).toBeDefined();
    // ALB's dependsOn was rewired ecs -> app-runner
    expect(state.recommendations.find((r) => r.serviceId === "alb")?.dependsOn).toContain(
      "app-runner",
    );
  });

  it("set_provider changes provider but leaves recs (re-inference is the route's job)", () => {
    const { state } = applyTool(baseState, "set_provider", {
      provider: "gcp",
      reason: "cost",
    });
    expect(state.provider).toBe("gcp");
    expect(state.recommendations).toEqual(baseState.recommendations);
  });

  it("set_region changes region", () => {
    const { state } = applyTool(baseState, "set_region", {
      region: "eu-west-1",
      reason: "data residency",
    });
    expect(state.region).toBe("eu-west-1");
  });

  it("scale_service merges scaling config into the named service", () => {
    const { state } = applyTool(baseState, "scale_service", {
      serviceId: "ecs",
      minInstances: 2,
      maxInstances: 10,
      instanceSize: "t3.large",
      reason: "more load",
    });
    const ecs = state.recommendations.find((r) => r.serviceId === "ecs");
    expect(ecs?.config).toMatchObject({
      minInstances: 2,
      maxInstances: 10,
      instanceSize: "t3.large",
    });
    // Other services untouched.
    expect(state.recommendations.find((r) => r.serviceId === "rds")?.config).toEqual({});
  });

  it("change_region updates region (post-deploy variant)", () => {
    const { state } = applyTool(baseState, "change_region", {
      region: "us-west-2",
      confirmDestructive: true,
      reason: "DR",
    });
    expect(state.region).toBe("us-west-2");
  });

  it("mutation log captures before/after snapshots", () => {
    const { mutation } = applyTool(baseState, "remove_service", {
      serviceId: "rds",
      reason: "x",
    });
    expect(mutation.before).toHaveLength(3);
    expect(mutation.after).toHaveLength(2);
    expect(mutation.tool).toBe("remove_service");
    expect(mutation.rationale).toBe("x");
  });
});
