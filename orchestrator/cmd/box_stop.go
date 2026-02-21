package cmd

import "github.com/spf13/cobra"

var boxStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Stop()
	},
}

func init() { boxCmd.AddCommand(boxStopCmd) }
