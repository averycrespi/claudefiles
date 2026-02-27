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
Does NOT delete the branch itself unless -d or -D is passed.
Must be run from the main repository, not a worktree.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		deleteBranch, _ := cmd.Flags().GetBool("delete")
		forceDelete, _ := cmd.Flags().GetBool("force-delete")
		if deleteBranch && forceDelete {
			return fmt.Errorf("cannot use both -d and -D; use -D for force delete")
		}
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		return newWorkspaceService().Remove(cwd, args[0], deleteBranch, forceDelete)
	},
}

func init() {
	rmCmd.Flags().BoolP("delete", "d", false, "Delete the branch (git branch -d)")
	rmCmd.Flags().BoolP("force-delete", "D", false, "Force delete the branch (git branch -D)")
	rootCmd.AddCommand(rmCmd)
}
