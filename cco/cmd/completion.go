package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

func completeBranches(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
	if len(args) > 0 {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	cwd, err := os.Getwd()
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	branches, err := newGitClient().ListBranches(cwd)
	if err != nil {
		return nil, cobra.ShellCompDirectiveNoFileComp
	}
	return branches, cobra.ShellCompDirectiveNoFileComp
}
