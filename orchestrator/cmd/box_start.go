package cmd

import "github.com/spf13/cobra"

var boxStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Start()
	},
}

func init() { boxCmd.AddCommand(boxStartCmd) }
