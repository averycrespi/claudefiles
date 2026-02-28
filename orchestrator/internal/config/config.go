package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/averycrespi/claudefiles/orchestrator/internal/paths"
)

// Config represents the cco configuration file.
type Config struct {
	GoProxy GoProxyConfig `json:"go_proxy"`
}

// GoProxyConfig configures the file-system Go module proxy for sandbox jobs.
type GoProxyConfig struct {
	Patterns []string `json:"patterns"`
}

// Default returns a Config populated with default values.
func Default() *Config {
	return &Config{
		GoProxy: GoProxyConfig{
			Patterns: []string{},
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
