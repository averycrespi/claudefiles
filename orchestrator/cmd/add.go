package cmd

import (
	"fmt"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/workspace"
	"github.com/spf13/cobra"
)

var addCmd = &cobra.Command{
	Use:   "add <branch>",
	Short: "Create a workspace for a branch",
	Long: `Create a workspace (worktree + tmux window) for a branch, then launch Claude Code in it.

	This command is idempotent, and can safely be run multiple times:
	- If the tmux session does not exist -> initialize the session
	- If the branch does not exist -> create the branch
	- If the worktree does not exist -> create the worktree & perform setup
	- If the tmux window does not exist -> create the window & launch Claude Code

	Notes:
	- Must be run from the main repository, not a worktree`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return workspace.Add(cwd, args[0])
	},
}

func init() {
	rootCmd.AddCommand(addCmd)
}
