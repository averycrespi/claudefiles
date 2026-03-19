package cmd

import (
	"fmt"

	"github.com/averycrespi/claudefiles/cco/internal/config"
	"github.com/averycrespi/claudefiles/cco/internal/sandbox"
	"github.com/spf13/cobra"
)

var boxCmd = &cobra.Command{
	Use:   "box",
	Short: "Manage the sandbox",
}

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

var boxStartCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Start()
	},
}

var boxStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Stop()
	},
}

var boxDestroyCmd = &cobra.Command{
	Use:   "destroy",
	Short: "Destroy the sandbox",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Destroy()
	},
}

var boxStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show the sandbox status",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Status()
	},
}

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

var boxShellCmd = &cobra.Command{
	Use:   "shell [-- command]",
	Short: "Open a shell in the sandbox",
	Args:  cobra.ArbitraryArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return newSandboxService().Shell(args...)
	},
}

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

func init() {
	boxCmd.AddCommand(
		boxCreateCmd,
		boxStartCmd,
		boxStopCmd,
		boxDestroyCmd,
		boxStatusCmd,
		boxProvisionCmd,
		boxShellCmd,
		boxTemplateCmd,
	)
	rootCmd.AddCommand(boxCmd)
}
