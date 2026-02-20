package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/workspace"
	"github.com/spf13/cobra"
)

var notifyCmd = &cobra.Command{
	Use:   "notify",
	Short: "Add notification bell to current workspace's tmux window",
	Long: `Add a bell emoji prefix to the tmux window name.

	Designed for hooks; always exits 0, even when skipping.

	The bell is skipped when:
	- The window is already the active window in the session
	- The window already has a bell prefix
	- The command is not run from a cco-managed worktree`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return workspace.Notify(cwd)
	},
}

func init() {
	rootCmd.AddCommand(notifyCmd)
}
