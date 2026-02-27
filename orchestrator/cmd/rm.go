package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rmCmd = &cobra.Command{
	Use:   "rm <branch>",
	Short: "Remove a workspace",
	Long: `Remove the workspace (worktree + window) for a branch.

Skips any steps which have already been completed.
Does NOT delete the branch itself.
Must be run from the main repository, not a worktree.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return newWorkspaceService().Remove(cwd, args[0], false, false)
	},
}

func init() {
	rootCmd.AddCommand(rmCmd)
}
