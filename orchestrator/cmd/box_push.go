package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var boxPushCmd = &cobra.Command{
	Use:   "push <plan-path>",
	Short: "Push a plan into the sandbox for execution",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		planPath := args[0]

		// Verify plan file exists
		if _, err := os.Stat(planPath); os.IsNotExist(err) {
			return fmt.Errorf("plan file not found: %s", planPath)
		}

		// Get repo root
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		svc := newSandboxService()
		sessionID, err := svc.Push(cwd, planPath)
		if err != nil {
			return err
		}

		fmt.Printf("Session %s complete. Pull with: cco box pull %s\n", sessionID, sessionID)
		return nil
	},
}

func init() { boxCmd.AddCommand(boxPushCmd) }
