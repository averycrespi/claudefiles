package config

import (
	"os"
	"path/filepath"
	"testing"

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
