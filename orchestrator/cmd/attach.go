package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/workspace"
	"github.com/spf13/cobra"
)

var attachCmd = &cobra.Command{
	Use:   "attach [branch]",
	Short: "Attach to the tmux session, optionally at a specific branch window",
	Long: `Attach to (or switch to) the repository's tmux session.

	If a branch is provided, attach directly to that branch's window.
	If no branch is provided, attach to the session as-is.

	If the repository's tmux session does not exist, it will be created.`,
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
		return workspace.Attach(cwd, branch)
	},
}

func init() {
	rootCmd.AddCommand(attachCmd)
}
