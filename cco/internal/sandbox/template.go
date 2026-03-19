package sandbox

import (
	"bytes"
	"fmt"
	"os/user"
	"strconv"
	"text/template"

	"github.com/averycrespi/claudefiles/cco/internal/paths"
)

// TemplateParams contains the values used to render the lima.yaml template.
type TemplateParams struct {
	Username string
	UID      int
	GID      int
	HomeDir  string
	Mounts   []string
}

// HostTemplateParams returns TemplateParams populated from the current host user
// and config. Additional mounts (from config) can be passed in; the worktree
// base directory is always appended automatically.
func HostTemplateParams(configMounts []string) (TemplateParams, error) {
	u, err := user.Current()
	if err != nil {
		return TemplateParams{}, fmt.Errorf("failed to get current user: %w", err)
	}

	uid, err := strconv.Atoi(u.Uid)
	if err != nil {
		return TemplateParams{}, fmt.Errorf("failed to parse UID: %w", err)
	}

	gid, err := strconv.Atoi(u.Gid)
	if err != nil {
		return TemplateParams{}, fmt.Errorf("failed to parse GID: %w", err)
	}

	return TemplateParams{
		Username: u.Username,
		UID:      uid,
		GID:      gid,
		HomeDir:  u.HomeDir,
		Mounts:   append(configMounts, paths.WorktreeBaseDir()),
	}, nil
}

// RenderTemplate renders the embedded lima.yaml template with the given parameters.
func RenderTemplate(params TemplateParams) (string, error) {
	tmpl, err := template.New("lima").Parse(string(limaTemplate))
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, params); err != nil {
		return "", err
	}
	return buf.String(), nil
}
