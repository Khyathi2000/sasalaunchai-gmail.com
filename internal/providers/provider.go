package providers

import "github.com/saaketht/launch/internal/plan"

// Provider is the interface that each cloud provider implements.
type Provider interface {
	Name() string
	ValidateCredentials() error
	GenerateTerraform(p plan.DeploymentPlan, dir string) error
}
