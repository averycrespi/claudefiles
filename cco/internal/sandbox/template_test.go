package sandbox

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRenderTemplate_BasicFields(t *testing.T) {
	params := TemplateParams{
		Username: "testuser",
		UID:      1000,
		GID:      1000,
		HomeDir:  "/home/testuser",
		Mounts:   []string{"/home/testuser/src"},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	assert.Contains(t, result, "testuser")
	assert.Contains(t, result, "ubuntu-24.04")
	assert.Contains(t, result, "minimumLimaVersion")
}

func TestRenderTemplate_MountPaths(t *testing.T) {
	params := TemplateParams{
		Username: "testuser",
		UID:      501,
		GID:      20,
		HomeDir:  "/Users/testuser",
		Mounts: []string{
			"/Users/testuser/src/work",
			"/Users/testuser/src/personal",
		},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	assert.Contains(t, result, "/Users/testuser/src/work")
	assert.Contains(t, result, "/Users/testuser/src/personal")
	// Each mount should appear as both location and mountPoint
	assert.Contains(t, result, "location:")
	assert.Contains(t, result, "mountPoint:")
	assert.Contains(t, result, "writable: true")
}

func TestRenderTemplate_UserConfig(t *testing.T) {
	params := TemplateParams{
		Username: "myuser",
		UID:      501,
		GID:      20,
		HomeDir:  "/Users/myuser",
		Mounts:   []string{},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	assert.Contains(t, result, "name: myuser")
	// UID and GID should be in the user section
	assert.Contains(t, result, "uid: 501")
	assert.Contains(t, result, "gid: 20")
	assert.Contains(t, result, "home: /Users/myuser")
}

func TestRenderTemplate_NoWorkspaceDir(t *testing.T) {
	params := TemplateParams{
		Username: "testuser",
		UID:      1000,
		GID:      1000,
		HomeDir:  "/home/testuser",
		Mounts:   []string{},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	// Should NOT contain /workspace references
	assert.NotContains(t, result, "/workspace")
}

func TestRenderTemplate_DockerProvisioning(t *testing.T) {
	params := TemplateParams{
		Username: "testuser",
		UID:      1000,
		GID:      1000,
		HomeDir:  "/home/testuser",
		Mounts:   []string{},
	}

	result, err := RenderTemplate(params)

	require.NoError(t, err)
	assert.Contains(t, result, "docker")
	assert.Contains(t, result, "claude")
	// Username should be used in docker group add
	assert.True(t, strings.Contains(result, "usermod -aG docker"))
}
