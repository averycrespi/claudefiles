package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"

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
