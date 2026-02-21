package cmd

import (
	"github.com/averycrespi/claudefiles/orchestrator/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show the sandbox VM status",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return sandbox.Status()
	},
}

func init() {
	boxCmd.AddCommand(boxStatusCmd)
}
