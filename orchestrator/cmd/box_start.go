package cmd

import (
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the sandbox VM",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return sandbox.Start()
	},
}

func init() {
	boxCmd.AddCommand(boxStartCmd)
}
