package tui

import (
	"fmt"

	"github.com/charmbracelet/lipgloss"
	"github.com/saaketht/launch/internal/plan"
)

// StepResult controls orchestrator flow after a step completes.
type StepResult int

const (
	StepContinue StepResult = iota // advance to the next step
	StepRetry                      // re-run this step
	StepAbort                      // skip all remaining steps
)

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("12")).
			MarginBottom(1)

	successStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("10"))

	dimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("8"))
)

// Run executes the full TUI wizard flow and returns the completed deployment plan.
func Run(workDir string) (*plan.DeploymentPlan, error) {
	dp := &plan.DeploymentPlan{
		WorkDir: workDir,
	}

	fmt.Println(titleStyle.Render("🚀 launch — cloud deployment wizard"))
	fmt.Println()

	steps := []struct {
		name string
		fn   func(*plan.DeploymentPlan) (StepResult, error)
	}{
		{"Provider Selection", stepProvider},
		{"Service Selection", stepServices},
		{"Service Configuration", stepConfigure},
		{"Credential Check", stepAuth},
		{"Plan Generation", stepPlan},
		{"Report", stepReport},
	}

	for i := 0; i < len(steps); i++ {
		step := steps[i]
		header := fmt.Sprintf("Step %d/%d: %s", i+1, len(steps), step.name)
		fmt.Println(dimStyle.Render(header))

		result, err := step.fn(dp)
		if err != nil {
			return nil, fmt.Errorf("step %q: %w", step.name, err)
		}

		fmt.Println()

		switch result {
		case StepRetry:
			i-- // will re-run this step
		case StepAbort:
			fmt.Println(dimStyle.Render("Wizard ended early."))
			return dp, nil
		}
	}

	fmt.Println(successStyle.Render("✓ Wizard complete!"))
	return dp, nil
}
