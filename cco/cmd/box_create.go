package cmd

import "github.com/spf13/cobra"

var boxCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create, start, and provision the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Create()
	},
}

func init() { boxCmd.AddCommand(boxCreateCmd) }
