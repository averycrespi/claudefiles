package goproxy

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPrefixFromPattern(t *testing.T) {
	tests := []struct {
		pattern string
		want    string
	}{
		{"github.com/myorg/*", "github.com/myorg/"},
		{"github.com/other/*", "github.com/other/"},
		{"example.com/*", "example.com/"},
		{"no-glob", "no-glob"},
	}
	for _, tt := range tests {
		assert.Equal(t, tt.want, prefixFromPattern(tt.pattern), "pattern: %s", tt.pattern)
	}
}

func TestFindMatchingDeps_NoGoMod(t *testing.T) {
	dir := t.TempDir()
	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	assert.Empty(t, deps)
}

func TestFindMatchingDeps_RootGoMod(t *testing.T) {
	dir := t.TempDir()
	gomod := `module example.com/myapp

go 1.23

require (
	github.com/myorg/foo v1.2.3
	github.com/myorg/bar v0.4.0
	github.com/public/lib v1.0.0
)
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"github.com/myorg/foo@v1.2.3", "github.com/myorg/bar@v0.4.0"}, deps)
}

func TestFindMatchingDeps_NestedGoMod(t *testing.T) {
	dir := t.TempDir()

	// Root go.mod
	rootMod := `module example.com/myapp

go 1.23

require github.com/myorg/foo v1.0.0
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(rootMod), 0o644))

	// Nested go.mod
	subDir := filepath.Join(dir, "tools")
	require.NoError(t, os.MkdirAll(subDir, 0o755))
	subMod := `module example.com/myapp/tools

go 1.23

require github.com/myorg/bar v0.5.0
`
	require.NoError(t, os.WriteFile(filepath.Join(subDir, "go.mod"), []byte(subMod), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"github.com/myorg/foo@v1.0.0", "github.com/myorg/bar@v0.5.0"}, deps)
}

func TestFindMatchingDeps_Deduplication(t *testing.T) {
	dir := t.TempDir()

	// Two go.mod files requiring the same dependency at the same version
	mod1 := `module example.com/a

go 1.23

require github.com/myorg/foo v1.0.0
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(mod1), 0o644))

	subDir := filepath.Join(dir, "sub")
	require.NoError(t, os.MkdirAll(subDir, 0o755))
	mod2 := `module example.com/b

go 1.23

require github.com/myorg/foo v1.0.0
`
	require.NoError(t, os.WriteFile(filepath.Join(subDir, "go.mod"), []byte(mod2), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	assert.Equal(t, []string{"github.com/myorg/foo@v1.0.0"}, deps)
}

func TestFindMatchingDeps_MultiplePatterns(t *testing.T) {
	dir := t.TempDir()
	gomod := `module example.com/myapp

go 1.23

require (
	github.com/orgA/foo v1.0.0
	github.com/orgB/bar v0.8.0
	github.com/public/lib v1.3.0
)
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/orgA/*", "github.com/orgB/*"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"github.com/orgA/foo@v1.0.0", "github.com/orgB/bar@v0.8.0"}, deps)
}

func TestFindMatchingDeps_EmptyPatterns(t *testing.T) {
	dir := t.TempDir()
	gomod := `module example.com/myapp

go 1.23

require github.com/myorg/foo v1.0.0
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0o644))

	deps, err := FindMatchingDeps(dir, nil)
	require.NoError(t, err)
	assert.Empty(t, deps)
}

func TestFindMatchingDeps_IndirectDeps(t *testing.T) {
	dir := t.TempDir()
	gomod := `module example.com/myapp

go 1.23

require (
	github.com/myorg/direct v1.0.0
	github.com/myorg/indirect v0.3.0 // indirect
)
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "go.mod"), []byte(gomod), 0o644))

	deps, err := FindMatchingDeps(dir, []string{"github.com/myorg/*"})
	require.NoError(t, err)
	// Should include both direct and indirect — the sandbox needs them all
	assert.ElementsMatch(t, []string{"github.com/myorg/direct@v1.0.0", "github.com/myorg/indirect@v0.3.0"}, deps)
}
