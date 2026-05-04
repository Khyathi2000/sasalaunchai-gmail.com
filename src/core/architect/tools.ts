// JSON-schema tool definitions for the architect chat agent. The agent
// gets these tools via Claude's tool-use API. Each tool mutates the
// session's recommendation list (pre-deploy) or the deployed plan
// (post-deploy).

import type { ServiceRecommendation } from "../types/cloud.js";

export interface ArchitectTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const PRE_DEPLOY_TOOLS: ArchitectTool[] = [
  {
    name: "add_service",
    description:
      "Add a service to the current architecture. Use this when the user wants a capability not currently in the recommendation list. The service must be one of the registered service ids (vpc, ecs, lambda, rds, redis, etc.). Provider and category are required.",
    input_schema: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Registered service id, e.g. 'rds', 'cloud-run'" },
        serviceName: { type: "string", description: "Human-readable name, e.g. 'RDS Postgres'" },
        provider: { type: "string", enum: ["aws", "gcp"] },
        category: {
          type: "string",
          description: "One of: networking, auth, compute, database, cache, storage, messaging, events, workflows, api, search, analytics, ml, cicd, observability, secrets, k8s, registry",
        },
        reason: { type: "string", description: "One-sentence rationale shown to the user" },
        config: { type: "object", description: "Optional service-specific config keys", additionalProperties: true },
        dependsOn: {
          type: "array",
          items: { type: "string" },
          description: "Service ids this new service depends on (e.g. ['vpc'])",
        },
      },
      required: ["serviceId", "serviceName", "provider", "category", "reason"],
    },
  },
  {
    name: "remove_service",
    description: "Remove a service from the current recommendation list.",
    input_schema: {
      type: "object",
      properties: {
        serviceId: { type: "string" },
        reason: { type: "string", description: "One-sentence rationale" },
      },
      required: ["serviceId", "reason"],
    },
  },
  {
    name: "swap_service",
    description:
      "Replace one service with another (e.g. swap ECS for App Runner). Equivalent to remove_service + add_service in one step but keeps the dependency edges intact.",
    input_schema: {
      type: "object",
      properties: {
        fromServiceId: { type: "string" },
        toServiceId: { type: "string" },
        toServiceName: { type: "string" },
        provider: { type: "string", enum: ["aws", "gcp"] },
        category: { type: "string" },
        reason: { type: "string" },
        config: { type: "object", additionalProperties: true },
      },
      required: ["fromServiceId", "toServiceId", "toServiceName", "provider", "category", "reason"],
    },
  },
  {
    name: "set_provider",
    description: "Switch the entire architecture to a different cloud provider. Triggers re-inference on the new provider.",
    input_schema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["aws", "gcp"] },
        reason: { type: "string" },
      },
      required: ["provider", "reason"],
    },
  },
  {
    name: "set_region",
    description: "Change the deployment region.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", description: "e.g. 'us-east-1', 'us-central1'" },
        reason: { type: "string" },
      },
      required: ["region", "reason"],
    },
  },
];

export const POST_DEPLOY_TOOLS: ArchitectTool[] = [
  {
    name: "scale_service",
    description: "Adjust the scaling parameters of an already-deployed service (min/max instances, concurrency, instance size).",
    input_schema: {
      type: "object",
      properties: {
        serviceId: { type: "string" },
        minInstances: { type: "number" },
        maxInstances: { type: "number" },
        instanceSize: { type: "string", description: "e.g. 't3.medium', 'db-n1-standard-2'" },
        reason: { type: "string" },
      },
      required: ["serviceId", "reason"],
    },
  },
  {
    name: "add_service_to_running_deployment",
    description: "Add a new service to a running deployment. Generates a Terraform diff that the user must approve before apply.",
    input_schema: PRE_DEPLOY_TOOLS[0].input_schema,
  },
  {
    name: "change_region",
    description: "Move the deployment to a new region. Note: this is a destructive operation that may require data migration.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string" },
        confirmDestructive: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["region", "confirmDestructive", "reason"],
    },
  },
];

// Mutation engine ----------------------------------------------------------

export type ToolName =
  | "add_service"
  | "remove_service"
  | "swap_service"
  | "set_provider"
  | "set_region"
  | "scale_service"
  | "add_service_to_running_deployment"
  | "change_region";

export interface MutationLog {
  ts: string;
  tool: ToolName;
  input: Record<string, unknown>;
  before: ServiceRecommendation[];
  after: ServiceRecommendation[];
  rationale: string;
}

export interface ArchitectState {
  provider: "aws" | "gcp";
  region: string;
  recommendations: ServiceRecommendation[];
}

/**
 * Apply a single tool call to the current architect state. Returns the
 * new state plus a structured mutation log. Pure — no IO.
 */
export function applyTool(
  state: ArchitectState,
  tool: ToolName,
  input: Record<string, unknown>,
): { state: ArchitectState; mutation: MutationLog } {
  const before = [...state.recommendations];
  let next: ServiceRecommendation[] = before;
  let nextProvider = state.provider;
  let nextRegion = state.region;
  const rationale = String(input.reason ?? "");

  switch (tool) {
    case "add_service":
    case "add_service_to_running_deployment": {
      const id = String(input.serviceId);
      if (before.find((r) => r.serviceId === id)) {
        next = before; // idempotent — already present
      } else {
        next = [
          ...before,
          {
            serviceId: id,
            serviceName: String(input.serviceName ?? id),
            category: String(input.category ?? "compute"),
            provider: String(input.provider ?? state.provider),
            reason: rationale || "Added by architect",
            confidence: "medium",
            config: (input.config as Record<string, unknown>) ?? {},
            dependsOn: Array.isArray(input.dependsOn) ? (input.dependsOn as string[]) : [],
          },
        ];
      }
      break;
    }
    case "remove_service": {
      const id = String(input.serviceId);
      next = before.filter((r) => r.serviceId !== id);
      break;
    }
    case "swap_service": {
      const from = String(input.fromServiceId);
      const fromRec = before.find((r) => r.serviceId === from);
      const to = String(input.toServiceId);
      const filtered = before.filter((r) => r.serviceId !== from);
      next = [
        ...filtered,
        {
          serviceId: to,
          serviceName: String(input.toServiceName ?? to),
          category: String(input.category ?? fromRec?.category ?? "compute"),
          provider: String(input.provider ?? state.provider),
          reason: rationale || `Swapped from ${from}`,
          confidence: "medium",
          config: (input.config as Record<string, unknown>) ?? {},
          dependsOn: fromRec?.dependsOn ?? [],
        },
      ];
      // Rewrite anyone who dependsOn from -> to so the graph stays intact.
      next = next.map((r) =>
        r.dependsOn.includes(from)
          ? { ...r, dependsOn: r.dependsOn.map((d) => (d === from ? to : d)) }
          : r,
      );
      break;
    }
    case "set_provider": {
      const p = input.provider === "aws" || input.provider === "gcp" ? input.provider : state.provider;
      nextProvider = p;
      // Recommendations need re-inference on new provider — we leave the
      // list as-is here and let the route trigger a fresh /api/infer.
      break;
    }
    case "set_region":
    case "change_region": {
      nextRegion = String(input.region ?? state.region);
      break;
    }
    case "scale_service": {
      const id = String(input.serviceId);
      next = before.map((r) =>
        r.serviceId === id
          ? {
              ...r,
              config: {
                ...r.config,
                ...(input.minInstances != null ? { minInstances: input.minInstances } : {}),
                ...(input.maxInstances != null ? { maxInstances: input.maxInstances } : {}),
                ...(input.instanceSize != null ? { instanceSize: input.instanceSize } : {}),
              },
            }
          : r,
      );
      break;
    }
  }

  return {
    state: { provider: nextProvider, region: nextRegion, recommendations: next },
    mutation: {
      ts: new Date().toISOString(),
      tool,
      input,
      before,
      after: next,
      rationale,
    },
  };
}
