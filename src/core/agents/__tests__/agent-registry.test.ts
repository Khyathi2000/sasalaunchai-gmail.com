import { describe, it, expect } from "vitest";
import { createAgent, getAvailableAgentIds } from "../agent-registry.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

function rec(serviceId: string, provider: string): ServiceRecommendation {
  return {
    serviceId,
    serviceName: serviceId,
    category: "compute",
    provider,
    reason: "test",
    confidence: "high",
    config: {},
    dependsOn: [],
  };
}

describe("agent-registry", () => {
  it("registers the four new AWS agents (EKS, Bedrock, CodeBuild, CodePipeline)", () => {
    const aws = getAvailableAgentIds("aws");
    expect(aws).toContain("eks");
    expect(aws).toContain("bedrock");
    expect(aws).toContain("codebuild");
    expect(aws).toContain("codepipeline");
  });

  it("createAgent returns instances for the new AWS agents", () => {
    for (const id of ["eks", "bedrock", "codebuild", "codepipeline"]) {
      const a = createAgent(rec(id, "aws"));
      expect(a, `agent ${id} should be createable`).not.toBeNull();
      expect(a!.serviceId).toBe(id);
    }
  });

  it("returns null for unknown service ids", () => {
    expect(createAgent(rec("not-a-real-service", "aws"))).toBeNull();
  });

  it("AWS + GCP totals match expectations after M4", () => {
    const aws = getAvailableAgentIds("aws");
    const gcp = getAvailableAgentIds("gcp");
    // M1 inventory: 22 AWS + 21 GCP = 43; +4 AWS in M4 -> 26 AWS, GCP unchanged.
    expect(aws.length).toBe(26);
    expect(gcp.length).toBe(21);
  });
});
