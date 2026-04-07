export enum StepResult {
  Continue = "continue",
  Retry = "retry",
  Abort = "abort",
}

export interface ServiceSelection {
  serviceId: string;
  config: Record<string, unknown>;
}

export interface DeploymentPlan {
  source: string;
  provider: string;
  region: string;
  services: ServiceSelection[];
  workDir: string;
  applyMode: boolean;
  infraRequirements?: InfraRequirements;
}

export interface InfraRequirements {
  runtime: { type: "container" | "serverless" | "vm"; reason: string };
  databases: { type: string; engine: string; reason: string }[];
  storage: { type: string; reason: string }[];
  messaging: { type: string; reason: string }[];
  caching: { type: string; reason: string }[];
  networking: { needsLoadBalancer: boolean; needsCDN: boolean; needsVPN: boolean; reason: string };
  auth: { type: string; provider: string; reason: string };
  scaling: { min: number; max: number; metric: string; reason: string };
  envVars: { key: string; description: string; sensitive: boolean }[];
}
