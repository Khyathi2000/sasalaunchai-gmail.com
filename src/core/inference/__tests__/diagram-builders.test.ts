import { describe, it, expect } from "vitest";
import {
  buildArchitectureMermaid,
  buildCicdMermaid,
  buildDeploymentFlowMermaid,
} from "../diagram-builders.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

function rec(
  serviceId: string,
  category: string,
  provider: string,
  dependsOn: string[] = [],
): ServiceRecommendation {
  return {
    serviceId,
    serviceName: serviceId,
    category,
    provider,
    reason: "test",
    confidence: "high",
    config: {},
    dependsOn,
  };
}

describe("buildArchitectureMermaid", () => {
  it("returns a flowchart with one node per service", () => {
    const out = buildArchitectureMermaid([
      rec("vpc", "networking", "aws"),
      rec("ecs", "compute", "aws", ["vpc"]),
      rec("rds", "database", "aws", ["vpc"]),
    ]);
    expect(out.startsWith("flowchart TD")).toBe(true);
    expect(out).toMatch(/vpc/);
    expect(out).toMatch(/ecs/);
    expect(out).toMatch(/rds/);
    expect(out).toMatch(/vpc --> ecs/);
    expect(out).toMatch(/vpc --> rds/);
  });

  it("renders an empty placeholder when no services", () => {
    const out = buildArchitectureMermaid([]);
    expect(out).toMatch(/No services recommended/);
  });

  it("groups multi-service categories into subgraphs", () => {
    const out = buildArchitectureMermaid([
      rec("rds", "database", "aws"),
      rec("dynamodb", "database", "aws"),
      rec("s3", "storage", "aws"),
    ]);
    expect(out).toMatch(/subgraph sg_database\[database\]/);
    // Single-item categories DON'T get a subgraph.
    expect(out).not.toMatch(/subgraph sg_storage\[storage\]/);
  });

  it("ignores edges to services not in the set", () => {
    const out = buildArchitectureMermaid([
      rec("ecs", "compute", "aws", ["vpc-not-here"]),
    ]);
    expect(out).not.toMatch(/--> ecs/);
  });

  it("escapes service ids with non-alphanum characters", () => {
    const out = buildArchitectureMermaid([
      rec("api-gateway", "api", "aws"),
      rec("step-functions", "workflows", "aws", ["api-gateway"]),
    ]);
    expect(out).toMatch(/api_gateway\[/);
    expect(out).toMatch(/step_functions\[/);
    expect(out).toMatch(/api_gateway --> step_functions/);
  });
});

describe("buildCicdMermaid", () => {
  it("uses Cloud Build when present", () => {
    const out = buildCicdMermaid(
      [rec("cloud-build", "cicd", "gcp"), rec("cloud-run", "compute", "gcp")],
      { hasDockerfile: true },
    );
    expect(out).toMatch(/subgraph ci\[Cloud Build\]/);
    expect(out).toMatch(/push/);
    expect(out).toMatch(/Cloud Run/);
  });

  it("uses CodePipeline+CodeBuild when present", () => {
    const out = buildCicdMermaid(
      [rec("codepipeline", "cicd", "aws"), rec("codebuild", "cicd", "aws"), rec("ecs", "compute", "aws")],
      { hasDockerfile: true },
    );
    expect(out).toMatch(/subgraph ci\[CodePipeline \+ CodeBuild\]/);
  });

  it("falls back to GitHub Actions when no CI service is in the recs", () => {
    const out = buildCicdMermaid([rec("lambda", "compute", "aws")]);
    expect(out).toMatch(/subgraph ci\[GitHub Actions\]/);
  });

  it("omits the push stage when not container-bound", () => {
    const out = buildCicdMermaid([rec("lambda", "compute", "aws")], { hasDockerfile: false });
    expect(out).not.toMatch(/\bpush\b/);
  });

  it("includes a push stage and registry node for container deploys", () => {
    const out = buildCicdMermaid(
      [rec("ecr", "registry", "aws"), rec("ecs", "compute", "aws")],
      { hasDockerfile: true },
    );
    expect(out).toMatch(/push --> Reg\["ECR"\]/);
  });
});

describe("buildDeploymentFlowMermaid", () => {
  it("groups services into tier subgraphs respecting dependsOn", () => {
    const out = buildDeploymentFlowMermaid([
      rec("vpc", "networking", "aws"),
      rec("rds", "database", "aws", ["vpc"]),
      rec("ecs", "compute", "aws", ["vpc", "rds"]),
    ]);
    expect(out).toMatch(/subgraph tier_0\[Tier 1\]/);
    expect(out).toMatch(/subgraph tier_1\[Tier 2\]/);
    expect(out).toMatch(/subgraph tier_2\[Tier 3\]/);
    expect(out).toMatch(/tier_0 ==> tier_1/);
    expect(out).toMatch(/tier_1 ==> tier_2/);
  });

  it("returns placeholder for empty input", () => {
    expect(buildDeploymentFlowMermaid([])).toMatch(/No services to deploy/);
  });
});
