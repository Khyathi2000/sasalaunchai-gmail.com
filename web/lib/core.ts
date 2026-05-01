// Re-exports of CLI-side modules so route handlers can import from one place.
// These run in Node.js runtime only.

export { runParserAgent } from "@core/analysis/parser-agent.js";
export type { ParserProgressCallback } from "@core/analysis/parser-agent.js";

export { runAnalyzerAgent } from "@core/analysis/analyzer-agent.js";
export type { AnalyzerStreamCallback } from "@core/analysis/analyzer-agent.js";

export { inferServices, buildDependencyOrder } from "@core/inference/inference-engine.js";
export { refineRecommendations } from "@core/inference/llm-refiner.js";

export {
  DeploymentOrchestrator,
  type DeploymentResult,
  type ServiceLifecycleResult,
} from "@core/agents/deployment-orchestrator.js";
export {
  DeploymentAgent,
  type LifecycleState,
  type ProvisionResult,
} from "@core/agents/agent-base.js";
export { MessageBus } from "@core/agents/message-bus.js";
export {
  MigrationOrchestrator,
  type MigrationStatus,
  type MigrationPhase,
} from "@core/agents/migration-orchestrator.js";

export { StateStore, type DeploymentState } from "@core/state/store.js";
export { ExecutionJournal } from "@core/state/journal.js";
export { ExecutionLock } from "@core/state/lock.js";

export { estimateCosts, fetchRealCosts, type CostBreakdown } from "@core/monitoring/collectors/cost.js";
export { collectMetrics, type ServiceMetrics } from "@core/monitoring/collectors/metrics.js";

export type {
  DeploymentPlan,
  ServiceSelection,
  InfraRequirements,
} from "@core/types/plan.js";
export type {
  ServiceRecommendation,
  AgentStatusType,
  AgentOutput,
} from "@core/types/cloud.js";
export type {
  ParsedCodebase,
  AnalysisResult,
  FileExplanation,
  TechConsideration,
} from "@core/types/index.js";
export type { AgentMessage } from "@core/types/events.js";
