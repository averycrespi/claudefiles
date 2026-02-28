package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/averycrespi/claudefiles/orchestrator/internal/logging"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_FileNotFound(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	cfg, err := Load()
	require.NoError(t, err)
	assert.Empty(t, cfg.GoProxy.Patterns)
}

func TestLoad_EmptyJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "cco"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "cco", "config.json"), []byte("{}"), 0o644))

	cfg, err := Load()
	require.NoError(t, err)
	assert.Empty(t, cfg.GoProxy.Patterns)
}

func TestLoad_WithPatterns(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "cco"), 0o755))
	data := []byte(`{"go_proxy": {"patterns": ["github.com/myorg/*", "github.com/other/*"]}}`)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "cco", "config.json"), data, 0o644))

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, []string{"github.com/myorg/*", "github.com/other/*"}, cfg.GoProxy.Patterns)
}

func TestLoad_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "cco"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "cco", "config.json"), []byte("not json"), 0o644))

	_, err := Load()
	assert.Error(t, err)
}

func TestDefault(t *testing.T) {
	cfg := Default()
	assert.NotNil(t, cfg)
	assert.Empty(t, cfg.GoProxy.Patterns)
}

func TestInit_CreatesFileWhenMissing(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)

	logger := logging.NoopLogger{}
	err := Init(logger)
	require.NoError(t, err)

	data, err := os.ReadFile(filepath.Join(dir, "cco", "config.json"))
	require.NoError(t, err)

	var cfg Config
	require.NoError(t, json.Unmarshal(data, &cfg))
	assert.Empty(t, cfg.GoProxy.Patterns)
}

func TestInit_NoopWhenFileExists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "cco"), 0o755))

	existing := []byte(`{"go_proxy": {"patterns": ["github.com/myorg/*"]}}`)
	configPath := filepath.Join(dir, "cco", "config.json")
	require.NoError(t, os.WriteFile(configPath, existing, 0o644))

	logger := logging.NoopLogger{}
	err := Init(logger)
	require.NoError(t, err)

	data, err := os.ReadFile(configPath)
	require.NoError(t, err)
	assert.Equal(t, existing, data)
}

func TestInit_CreatesDirectory(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(dir, "nested", "path"))

	logger := logging.NoopLogger{}
	err := Init(logger)
	require.NoError(t, err)

	_, err = os.Stat(filepath.Join(dir, "nested", "path", "cco", "config.json"))
	assert.NoError(t, err)
}
