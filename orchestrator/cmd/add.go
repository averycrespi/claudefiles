package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/session"
	"github.com/spf13/cobra"
)

var addCmd = &cobra.Command{
	Use:   "add <branch>",
	Short: "Create a session and launch Claude Code",
	Long:  "Create a git worktree, tmux window, run setup scripts, and launch Claude Code. Creates the branch if it doesn't exist. Must be run from the main repository.",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return session.Add(cwd, args[0])
	},
}

func init() {
	rootCmd.AddCommand(addCmd)
}
