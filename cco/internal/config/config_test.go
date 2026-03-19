package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/averycrespi/claudefiles/cco/internal/logging"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_FileNotFound(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	cfg, err := Load()

	require.NoError(t, err)
	assert.Empty(t, cfg.Sandbox.Mounts)
	assert.Empty(t, cfg.Sandbox.ProvisionPaths)
}

func TestLoad_EmptyJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	ccoDir := filepath.Join(dir, "cco")
	require.NoError(t, os.MkdirAll(ccoDir, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(ccoDir, "config.json"), []byte("{}"), 0o644))

	cfg, err := Load()

	require.NoError(t, err)
	assert.Empty(t, cfg.Sandbox.Mounts)
	assert.Empty(t, cfg.Sandbox.ProvisionPaths)
}

func TestLoad_WithSandboxConfig(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	ccoDir := filepath.Join(dir, "cco")
	require.NoError(t, os.MkdirAll(ccoDir, 0o755))
	data := []byte(`{
		"sandbox": {
			"mounts": ["/Users/me/src/work"],
			"provision_paths": ["/Users/me/.claude", "/Users/me/.claude/sandbox/settings.json:/Users/me/.claude/settings.json"]
		}
	}`)
	require.NoError(t, os.WriteFile(filepath.Join(ccoDir, "config.json"), data, 0o644))

	cfg, err := Load()

	require.NoError(t, err)
	assert.Equal(t, []string{"/Users/me/src/work"}, cfg.Sandbox.Mounts)
	assert.Equal(t, []string{
		"/Users/me/.claude",
		"/Users/me/.claude/sandbox/settings.json:/Users/me/.claude/settings.json",
	}, cfg.Sandbox.ProvisionPaths)
}

func TestLoad_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	ccoDir := filepath.Join(dir, "cco")
	require.NoError(t, os.MkdirAll(ccoDir, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(ccoDir, "config.json"), []byte("not json"), 0o644))

	_, err := Load()

	assert.Error(t, err)
}

func TestDefault(t *testing.T) {
	cfg := Default()

	assert.Empty(t, cfg.Sandbox.Mounts)
	assert.Empty(t, cfg.Sandbox.ProvisionPaths)
}

func TestInit_CreatesFile(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)

	err := Init(logging.NoopLogger{})

	require.NoError(t, err)
	path := filepath.Join(dir, "cco", "config.json")
	assert.FileExists(t, path)

	cfg, err := Load()
	require.NoError(t, err)
	assert.Empty(t, cfg.Sandbox.Mounts)
}

func TestInit_NoopWhenExists(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)

	require.NoError(t, Init(logging.NoopLogger{}))
	require.NoError(t, Init(logging.NoopLogger{}))
}

func TestParseProvisionPath_Plain(t *testing.T) {
	src, dst := ParseProvisionPath("/Users/me/.claude")

	assert.Equal(t, "/Users/me/.claude", src)
	assert.Equal(t, "/Users/me/.claude", dst)
}

func TestParseProvisionPath_Mapped(t *testing.T) {
	src, dst := ParseProvisionPath("/Users/me/.claude/sandbox/settings.json:/Users/me/.claude/settings.json")

	assert.Equal(t, "/Users/me/.claude/sandbox/settings.json", src)
	assert.Equal(t, "/Users/me/.claude/settings.json", dst)
}
