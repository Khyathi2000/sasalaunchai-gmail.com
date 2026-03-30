package tui

import (
	"github.com/charmbracelet/huh"
	"github.com/saaketht/launch/internal/plan"
)

func stepProvider(dp *plan.DeploymentPlan) (StepResult, error) {
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewSelect[string]().
				Title("Cloud Provider").
				Description("Select your cloud provider").
				Options(
					huh.NewOption("Amazon Web Services (AWS)", "aws"),
					huh.NewOption("Google Cloud Platform (coming soon)", "gcp"),
					huh.NewOption("Microsoft Azure (coming soon)", "azure"),
				).
				Value(&dp.Provider),

			huh.NewSelect[string]().
				Title("Region").
				Description("Select your deployment region").
				Options(
					huh.NewOption("US East (N. Virginia) — us-east-1", "us-east-1"),
					huh.NewOption("US West (Oregon) — us-west-2", "us-west-2"),
					huh.NewOption("EU (Frankfurt) — eu-central-1", "eu-central-1"),
					huh.NewOption("EU (Ireland) — eu-west-1", "eu-west-1"),
					huh.NewOption("Asia Pacific (Tokyo) — ap-northeast-1", "ap-northeast-1"),
					huh.NewOption("Asia Pacific (Sydney) — ap-southeast-2", "ap-southeast-2"),
				).
				Value(&dp.Region),
		),
	).WithTheme(huh.ThemeBase())

	return StepContinue, form.Run()
}
