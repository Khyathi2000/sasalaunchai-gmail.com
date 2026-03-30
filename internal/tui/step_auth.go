package tui

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/saaketht/launch/internal/plan"
)

func stepAuth(dp *plan.DeploymentPlan) (StepResult, error) {
	fmt.Println("  Checking credentials for provider:", dp.Provider)

	// Simple env var / file check — no SDK calls
	switch dp.Provider {
	case "aws":
		if os.Getenv("AWS_ACCESS_KEY_ID") != "" && os.Getenv("AWS_SECRET_ACCESS_KEY") != "" {
			fmt.Println(successStyle.Render("  ✓ AWS credentials found (environment variables)"))
			return StepContinue, nil
		}

		home, err := os.UserHomeDir()
		if err == nil {
			credsPath := filepath.Join(home, ".aws", "credentials")
			if _, err := os.Stat(credsPath); err == nil {
				fmt.Println(successStyle.Render("  ✓ AWS credentials found (~/.aws/credentials)"))
				return StepContinue, nil
			}
		}

		fmt.Println(dimStyle.Render("  ⚠ No AWS credentials detected (env vars or ~/.aws/credentials)"))
		fmt.Println(dimStyle.Render("    This is fine for now — deployment steps are mocked."))
	default:
		fmt.Println(dimStyle.Render("  ⚠ Credential check not implemented for " + dp.Provider))
	}

	return StepContinue, nil
}
