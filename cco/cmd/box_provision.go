package cmd

import (
	"fmt"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/spf13/cobra"
)

var boxProvisionCmd = &cobra.Command{
	Use:   "provision",
	Short: "Provision the sandbox with config and dotfiles",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return fmt.Errorf("failed to load config: %w", err)
		}
		return newSandboxService().Provision(cfg.Sandbox)
	},
}

func init() { boxCmd.AddCommand(boxProvisionCmd) }
