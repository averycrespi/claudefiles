package cmd

import (
	"fmt"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/averycrespi/claudefiles/cco/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create, start, and provision the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return fmt.Errorf("failed to load config: %w", err)
		}

		params, err := sandbox.HostTemplateParams(cfg.Sandbox.Mounts)
		if err != nil {
			return err
		}

		return newSandboxService().Create(params, cfg.Sandbox)
	},
}

func init() { boxCmd.AddCommand(boxCreateCmd) }
