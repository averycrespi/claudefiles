package cmd

import "github.com/spf13/cobra"

var boxProvisionCmd = &cobra.Command{
	Use:   "provision",
	Short: "Provision the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Provision()
	},
}

func init() { boxCmd.AddCommand(boxProvisionCmd) }
