package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/huh"
	"github.com/saaketht/launch/internal/plan"
	"github.com/saaketht/launch/internal/services"
)

func stepServices(dp *plan.DeploymentPlan) (StepResult, error) {
	available := services.ForProvider(dp.Provider)

	// Find the longest service name for alignment
	maxNameLen := 0
	for _, svc := range available {
		if len(svc.Name) > maxNameLen {
			maxNameLen = len(svc.Name)
		}
	}

	var options []huh.Option[string]
	for _, svc := range available {
		label := fmt.Sprintf("%-*s  %s", maxNameLen, svc.Name, svc.Description)
		options = append(options, huh.NewOption(label, svc.ID))
	}

	var selected []string

	// Custom keymap: enter/x/space toggle, tab submits
	km := huh.NewDefaultKeyMap()
	km.MultiSelect.Toggle = key.NewBinding(key.WithKeys(" ", "x", "enter"), key.WithHelp("enter/x", "toggle"))
	km.MultiSelect.Next = key.NewBinding(key.WithKeys("tab"), key.WithHelp("tab", "confirm"))
	km.MultiSelect.Submit = key.NewBinding(key.WithKeys("tab"), key.WithHelp("tab", "submit"))

	form := huh.NewForm(
		huh.NewGroup(
			huh.NewMultiSelect[string]().
				Title("Services").
				Description("enter/x/space to toggle  •  tab to confirm").
				Options(options...).
				Value(&selected),
		),
	).WithTheme(huh.ThemeBase()).WithKeyMap(km)

	if err := form.Run(); err != nil {
		return StepContinue, err
	}

	if len(selected) == 0 {
		fmt.Println(dimStyle.Render("  No services selected."))
		return StepContinue, nil
	}

	// Confirmation step
	var confirm bool
	confirmForm := huh.NewForm(
		huh.NewGroup(
			huh.NewConfirm().
				Title(fmt.Sprintf("Continue with %d service(s) selected?", len(selected))).
				Value(&confirm),
		),
	).WithTheme(huh.ThemeBase())

	if err := confirmForm.Run(); err != nil {
		return StepContinue, err
	}

	if !confirm {
		// Clear any prior selections and retry
		dp.Services = nil
		fmt.Println(dimStyle.Render("  Going back to service selection..."))
		return StepRetry, nil
	}

	for _, id := range selected {
		dp.Services = append(dp.Services, plan.ServiceSelection{
			ServiceID: id,
			Config:    make(map[string]any),
		})
	}

	return StepContinue, nil
}
