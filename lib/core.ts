// Re-exports of CLI-side modules so route handlers can import from one place.
// These run in Node.js runtime only.

export { runParserAgent, RepoNotAccessibleError } from "@core/analysis/parser-agent";
export type { ParserProgressCallback } from "@core/analysis/parser-agent";

export { runAnalyzerAgent } from "@core/analysis/analyzer-agent";
export type { AnalyzerStreamCallback } from "@core/analysis/analyzer-agent";

export { inferServices, buildDependencyOrder } from "@core/inference/inference-engine";
export { refineRecommendations } from "@core/inference/llm-refiner";

export {
  DeploymentOrchestrator,
  type DeploymentResult,
  type ServiceLifecycleResult,
} from "@core/agents/deployment-orchestrator";
export {
  DeploymentAgent,
  type LifecycleState,
  type ProvisionResult,
} from "@core/agents/agent-base";
export { MessageBus } from "@core/agents/message-bus";
export {
  MigrationOrchestrator,
  type MigrationStatus,
  type MigrationPhase,
} from "@core/agents/migration-orchestrator";

export { StateStore, type DeploymentState } from "@core/state/store";
export { ExecutionJournal } from "@core/state/journal";
export { ExecutionLock } from "@core/state/lock";

export { estimateCosts, fetchRealCosts, type CostBreakdown } from "@core/monitoring/collectors/cost";
export { collectMetrics, type ServiceMetrics } from "@core/monitoring/collectors/metrics";

export type {
  DeploymentPlan,
  ServiceSelection,
  InfraRequirements,
} from "@core/types/plan";
export type {
  ServiceRecommendation,
  AgentStatusType,
  AgentOutput,
} from "@core/types/cloud";
export type {
  ParsedCodebase,
  AnalysisResult,
  FileExplanation,
  TechConsideration,
} from "@core/types/index";
export type { AgentMessage } from "@core/types/events";
