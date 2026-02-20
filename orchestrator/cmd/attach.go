package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/workspace"
	"github.com/spf13/cobra"
)

var attachCmd = &cobra.Command{
	Use:   "attach [branch]",
	Short: "Attach to the tmux session or window",
	Long: `Attach to the repository's tmux session, or a specific window in the session.

This command has two modes of operation:
- If a branch is provided -> attach to the branch's window in the session
- If no branch is provided -> just attach to the session itself

Notes:
- If the tmux session does not exist, it will be created
- Can be run from the main repository or a worktree
- If we're already in the tmux session, switch instead of attaching`,
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
