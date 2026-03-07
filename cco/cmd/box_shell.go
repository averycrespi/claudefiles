package cmd

import "github.com/spf13/cobra"

var boxShellCmd = &cobra.Command{
	Use:   "shell [-- command]",
	Short: "Open a shell in the sandbox",
	Args:  cobra.ArbitraryArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Shell(args...)
	},
}

func init() { boxCmd.AddCommand(boxShellCmd) }
