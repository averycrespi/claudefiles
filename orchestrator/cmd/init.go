package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/session"
	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Create tmux session for the current repository",
	Long:  "Create a tmux session with a 'main' window. Safe to run multiple times. Must be run from the main repository, not a worktree.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return session.Init(cwd)
	},
}

func init() {
	rootCmd.AddCommand(initCmd)
}
