package plan

// DeploymentPlan is the central data structure that flows through every TUI step.
// Each step populates a field.
type DeploymentPlan struct {
	Provider string               // "aws" for now
	Region   string               // e.g. "us-east-1"
	Services []ServiceSelection   // what the user picked
	WorkDir  string               // where .tf files get written
}

// ServiceSelection represents a user-selected service and its configuration.
type ServiceSelection struct {
	ServiceID string         // e.g. "ec2", "rds", "s3"
	Config    map[string]any // service-specific config (flexible for now)
}
