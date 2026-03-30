package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
	"github.com/saaketht/launch/internal/plan"
	"github.com/saaketht/launch/internal/services"
)

func stepPlan(dp *plan.DeploymentPlan) (StepResult, error) {
	if len(dp.Services) == 0 {
		fmt.Println("  No services to deploy — skipping plan.")
		return StepContinue, nil
	}

	lookup := servicesByID()

	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("8")).
		Padding(1, 2)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Provider:  %s\n", dp.Provider))
	sb.WriteString(fmt.Sprintf("Region:    %s\n", dp.Region))
	sb.WriteString(fmt.Sprintf("Work Dir:  %s\n", dp.WorkDir))
	sb.WriteString(fmt.Sprintf("Services:  %d\n\n", len(dp.Services)))

	for _, sel := range dp.Services {
		svc, ok := lookup[sel.ServiceID]
		if !ok {
			svc = services.Service{Name: sel.ServiceID}
		}
		mode := sel.Config["mode"]
		sb.WriteString(fmt.Sprintf("  • %-35s [%v]\n", svc.Name, mode))
	}

	sb.WriteString("\n[mock] Would provision resources via cloud SDK here.")

	fmt.Println(borderStyle.Render(sb.String()))

	var confirm bool
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewConfirm().
				Title("Apply this deployment plan?").
				Description("In a real run, this would call the cloud provider SDK to provision resources.").
				Value(&confirm),
		),
	).WithTheme(huh.ThemeBase())

	if err := form.Run(); err != nil {
		return StepContinue, err
	}

	if !confirm {
		fmt.Println(dimStyle.Render("  Deployment cancelled by user."))
		return StepAbort, nil
	}

	fmt.Println(dimStyle.Render("  [mock] Cloud SDK provisioning would run here."))
	return StepContinue, nil
}
