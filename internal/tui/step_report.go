package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/saaketht/launch/internal/plan"
	"github.com/saaketht/launch/internal/services"
)

func stepReport(dp *plan.DeploymentPlan) (StepResult, error) {
	if len(dp.Services) == 0 {
		fmt.Println("  Nothing was deployed.")
		return StepContinue, nil
	}

	lookup := servicesByID()

	headerStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("10")).
		MarginBottom(1)

	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("10")).
		Padding(1, 2)

	var sb strings.Builder
	sb.WriteString(headerStyle.Render("Deployment Summary"))
	sb.WriteString("\n\n")
	sb.WriteString(fmt.Sprintf("  Provider:  %s\n", dp.Provider))
	sb.WriteString(fmt.Sprintf("  Region:    %s\n", dp.Region))
	sb.WriteString(fmt.Sprintf("  Work Dir:  %s\n\n", dp.WorkDir))

	for _, sel := range dp.Services {
		svc, ok := lookup[sel.ServiceID]
		if !ok {
			svc = services.Service{Name: sel.ServiceID}
		}
		sb.WriteString(fmt.Sprintf("  ✓ %-35s provisioned (mock)\n", svc.Name))
	}

	sb.WriteString("\n  [mock] Real outputs (IPs, endpoints, ARNs) would appear here.")

	fmt.Println(borderStyle.Render(sb.String()))

	return StepContinue, nil
}
