package cmd

import (
	"fmt"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/averycrespi/claudefiles/cco/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxTemplateCmd = &cobra.Command{
	Use:   "template",
	Short: "Print the rendered lima.yaml template",
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

		result, err := newSandboxService().Template(params)
		if err != nil {
			return err
		}
		fmt.Print(result)
		return nil
	},
}

func init() { boxCmd.AddCommand(boxTemplateCmd) }
