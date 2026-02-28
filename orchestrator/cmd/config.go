package cmd

import (
	"fmt"
	"os"
	osexec "os/exec"

	"github.com/averycrespi/claudefiles/orchestrator/internal/config"
	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage cco configuration",
}

var configPathCmd = &cobra.Command{
	Use:   "path",
	Short: "Print config file path",
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println(paths.ConfigFilePath())
	},
}

var configShowCmd = &cobra.Command{
	Use:   "show",
	Short: "Print config file contents",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		logger := logging.NewStdLogger(verbose)
		path := paths.ConfigFilePath()
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				logger.Info("no config file found at %s", path)
				return nil
			}
			return err
		}
		fmt.Print(string(data))
		return nil
	},
}

var configInitCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize config file with defaults",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		logger := logging.NewStdLogger(verbose)
		return config.Init(logger)
	},
}

var configEditCmd = &cobra.Command{
	Use:   "edit",
	Short: "Open config file in $EDITOR",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		logger := logging.NewStdLogger(verbose)
		if err := config.Init(logger); err != nil {
			return err
		}

		editor := os.Getenv("EDITOR")
		if editor == "" {
			editor = "vi"
		}
		path := paths.ConfigFilePath()
		c := osexec.Command(editor, path)
		c.Stdin = os.Stdin
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr
		return c.Run()
	},
}

func init() {
	configCmd.AddCommand(configPathCmd, configShowCmd, configInitCmd, configEditCmd)
	rootCmd.AddCommand(configCmd)
}
