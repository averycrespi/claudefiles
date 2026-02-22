package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var addCmd = &cobra.Command{
	Use:   "add <branch>",
	Short: "Add a workspace",
	Long: `Add a workspace (worktree + window) for a branch, run setup, then launch Claude Code in it.

Skips any steps which have already been completed.
Must be run from the main repository, not a worktree.
`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		svc := newWorkspaceService()
		if err := svc.Add(cwd, args[0]); err != nil {
			return err
		}
		attach, _ := cmd.Flags().GetBool("attach")
		if attach {
			return svc.Attach(cwd, args[0])
		}
		return nil
	},
}

func init() {
	addCmd.Flags().BoolP("attach", "a", false, "Attach to the workspace after creation")
	rootCmd.AddCommand(addCmd)
}
