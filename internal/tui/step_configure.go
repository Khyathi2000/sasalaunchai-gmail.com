package tui

import (
	"fmt"

	"github.com/charmbracelet/huh"
	"github.com/saaketht/launch/internal/plan"
	"github.com/saaketht/launch/internal/services"
)

// servicesByID builds a lookup map from the registry.
func servicesByID() map[string]services.Service {
	m := make(map[string]services.Service)
	for _, s := range services.Registry {
		m[s.ID] = s
	}
	return m
}

func stepConfigure(dp *plan.DeploymentPlan) (StepResult, error) {
	if len(dp.Services) == 0 {
		fmt.Println("  No services selected — skipping configuration.")
		return StepContinue, nil
	}

	lookup := servicesByID()

	for i := range dp.Services {
		sel := &dp.Services[i]
		svc, ok := lookup[sel.ServiceID]
		if !ok {
			continue
		}

		var useDefaults bool
		form := huh.NewForm(
			huh.NewGroup(
				huh.NewConfirm().
					Title(fmt.Sprintf("Configure %s", svc.Name)).
					Description("Per-service configuration will be added in a future version.  Use defaults for now?").
					Value(&useDefaults),
			),
		).WithTheme(huh.ThemeBase())

		if err := form.Run(); err != nil {
			return StepContinue, err
		}

		if useDefaults {
			sel.Config["mode"] = "defaults"
		} else {
			sel.Config["mode"] = "custom (pending)"
		}
	}

	return StepContinue, nil
}
