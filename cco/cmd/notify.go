package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var notifyCmd = &cobra.Command{
	Use:   "notify",
	Short: "Add notification to current workspace (for hooks)",
	Long: `Add a notification to the current workspace's window (for usage by hooks).

Skips notifying if window is active, window already notified, or not in worktree.
Always returns exit code 0 (even on failure) to avoid disrupting hooks.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return newWorkspaceService().Notify(cwd)
	},
}

func init() {
	rootCmd.AddCommand(notifyCmd)
}
