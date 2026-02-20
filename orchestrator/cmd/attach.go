package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/session"
	"github.com/spf13/cobra"
)

var attachCmd = &cobra.Command{
	Use:   "attach",
	Short: "Attach to the tmux session for the current repository",
	Long:  "Attach to (or switch to) the worktree session. Works from both the main repo and worktrees.",
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return session.Attach(cwd)
	},
}

func init() {
	rootCmd.AddCommand(attachCmd)
}
