package cmd

import "github.com/spf13/cobra"

var boxDestroyCmd = &cobra.Command{
	Use:   "destroy",
	Short: "Destroy the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Destroy()
	},
}

func init() { boxCmd.AddCommand(boxDestroyCmd) }
