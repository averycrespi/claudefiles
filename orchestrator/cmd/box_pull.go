package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
)

var boxPullCmd = &cobra.Command{
	Use:   "pull <session-id>",
	Short: "Pull sandbox results back to the host",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		sessionID := args[0]

		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get working directory: %w", err)
		}

		svc := newSandboxService()
		return svc.Pull(cwd, sessionID, 30*time.Minute, 3*time.Second)
	},
}

func init() { boxCmd.AddCommand(boxPullCmd) }
