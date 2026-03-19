package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"

	"github.com/averycrespi/claudefiles/cco/internal/logging"
	"github.com/averycrespi/claudefiles/cco/internal/paths"
)

// Config represents the cco configuration file.
type Config struct {
	Sandbox SandboxConfig `json:"sandbox"`
}

// SandboxConfig configures the sandbox VM.
type SandboxConfig struct {
	Mounts         []string `json:"mounts"`
	ProvisionPaths []string `json:"provision_paths"`
}

// Default returns a Config populated with default values.
func Default() *Config {
	return &Config{
		Sandbox: SandboxConfig{
			Mounts:         []string{},
			ProvisionPaths: []string{},
		},
	}
}

// Init creates the config file with defaults if it doesn't exist.
// If the file already exists, it does nothing.
func Init(logger logging.Logger) error {
	path := paths.ConfigFilePath()

	if _, err := os.Stat(path); err == nil {
		logger.Info("config file already exists at %s", path)
		return nil
	}

	if err := os.MkdirAll(paths.ConfigDir(), 0o755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(Default(), "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal default config: %w", err)
	}
	data = append(data, '\n')

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	logger.Info("created config file at %s", path)
	return nil
}

// Load reads and parses the config file. Returns a zero-value Config if the file doesn't exist.
func Load() (*Config, error) {
	data, err := os.ReadFile(paths.ConfigFilePath())
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return &Config{}, nil
		}
		return nil, fmt.Errorf("failed to read config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}
	return &cfg, nil
}

// ParseProvisionPath parses a provision path entry.
// Plain paths return (path, path). Mapped paths "src:dst" return (src, dst).
func ParseProvisionPath(entry string) (src, dst string) {
	parts := strings.SplitN(entry, ":", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return entry, entry
}
