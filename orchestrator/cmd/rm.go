package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/session"
	"github.com/spf13/cobra"
)

var rmCmd = &cobra.Command{
	Use:   "rm <branch>",
	Short: "Remove a session and close its tmux window",
	Long:  "Remove the git worktree and close the tmux window for the given branch. Safe to run if either has already been removed. Must be run from the main repository.",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return session.Remove(cwd, args[0])
	},
}

func init() {
	rootCmd.AddCommand(rmCmd)
}
