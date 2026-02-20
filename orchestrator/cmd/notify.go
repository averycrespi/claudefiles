package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/session"
	"github.com/spf13/cobra"
)

var notifyCmd = &cobra.Command{
	Use:   "notify",
	Short: "Add notification bell to current session's tmux window",
	Long:  "Add a bell emoji prefix to the tmux window name. Designed for hooks; exits 0 even when skipping. Must be run from a worktree.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return session.Notify(cwd)
	},
}

func init() {
	rootCmd.AddCommand(notifyCmd)
}
