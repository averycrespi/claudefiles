package cmd

import (
	"fmt"
	"os"
	osexec "os/exec"

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
		path := paths.ConfigFilePath()
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				fmt.Printf("No config file found at %s\n", path)
				return nil
			}
			return err
		}
		fmt.Print(string(data))
		return nil
	},
}

var configEditCmd = &cobra.Command{
	Use:   "edit",
	Short: "Open config file in $EDITOR",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		path := paths.ConfigFilePath()

		// Create file with empty JSON object if it doesn't exist
		if _, err := os.Stat(path); os.IsNotExist(err) {
			if err := os.MkdirAll(paths.ConfigDir(), 0o755); err != nil {
				return fmt.Errorf("failed to create config directory: %w", err)
			}
			if err := os.WriteFile(path, []byte("{}\n"), 0o644); err != nil {
				return fmt.Errorf("failed to create config file: %w", err)
			}
		}

		editor := os.Getenv("EDITOR")
		if editor == "" {
			editor = "vi"
		}
		c := osexec.Command(editor, path)
		c.Stdin = os.Stdin
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr
		return c.Run()
	},
}

func init() {
	configCmd.AddCommand(configPathCmd, configShowCmd, configEditCmd)
	rootCmd.AddCommand(configCmd)
}
