export class LaunchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LaunchError";
  }
}

export class AgentError extends LaunchError {
  constructor(
    message: string,
    public readonly agentId: string,
    public readonly phase: string,
    details?: Record<string, unknown>
  ) {
    super(message, "AGENT_ERROR", { ...details, agentId, phase });
    this.name = "AgentError";
  }
}

export class DeploymentError extends LaunchError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "DEPLOYMENT_ERROR", details);
    this.name = "DeploymentError";
  }
}

export class ValidationError extends LaunchError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}
