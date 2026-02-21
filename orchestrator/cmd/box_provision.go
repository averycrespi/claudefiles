package cmd

import "github.com/spf13/cobra"

var boxProvisionCmd = &cobra.Command{
	Use:   "provision",
	Short: "Copy Claude config files into the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Provision()
	},
}

func init() { boxCmd.AddCommand(boxProvisionCmd) }
