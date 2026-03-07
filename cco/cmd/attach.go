package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var attachCmd = &cobra.Command{
	Use:   "attach [branch]",
	Short: "Attach to a window or session",
	Long: `Attach to a workspace's window (if branch provided), or the session itself (otherwise).

Creates the session if it doesn't already exist.
Switches windows (instead of attaching) if already inside the session.`,
	Args: cobra.MaximumNArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get working directory: %w", err)
		}
		var branch string
		if len(args) > 0 {
			branch = args[0]
		}
		return newWorkspaceService().Attach(cwd, branch)
	},
}

func init() {
	attachCmd.ValidArgsFunction = completeBranches
	rootCmd.AddCommand(attachCmd)
}
