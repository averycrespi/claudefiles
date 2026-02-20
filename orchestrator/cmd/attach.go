package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/session"
	"github.com/spf13/cobra"
)

var attachCmd = &cobra.Command{
	Use:   "attach [branch]",
	Short: "Attach to the tmux session, optionally at a specific branch window",
	Long: `Attach to (or switch to) the worktree session.

	If a branch is provided, attach directly to that branch's window.
	If no branch is provided, attach to the session as-is.

	This command will create the tmux session if it doesn't exist yet.
	Works from both the main repository and worktrees.`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		var branch string
		if len(args) > 0 {
			branch = args[0]
		}
		return session.Attach(cwd, branch)
	},
}

func init() {
	rootCmd.AddCommand(attachCmd)
}
