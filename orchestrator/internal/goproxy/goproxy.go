package goproxy

import (
	"fmt"
	"os"
	osexec "os/exec"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/mod/modfile"
)

// prefixFromPattern strips the trailing /* from a Go-style glob pattern
// to produce a prefix for matching module paths.
func prefixFromPattern(pattern string) string {
	return strings.TrimSuffix(pattern, "*")
}

// FindMatchingDeps scans all go.mod files in the worktree and returns
// deduplicated module@version strings for dependencies matching any pattern.
func FindMatchingDeps(worktreeDir string, patterns []string) ([]string, error) {
	if len(patterns) == 0 {
		return nil, nil
	}

	prefixes := make([]string, len(patterns))
	for i, p := range patterns {
		prefixes[i] = prefixFromPattern(p)
	}

	seen := make(map[string]bool)
	err := filepath.Walk(worktreeDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip unreadable directories
		}
		if info.IsDir() {
			return nil
		}
		if info.Name() != "go.mod" {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil // skip unreadable files
		}

		f, err := modfile.ParseLax(path, data, nil)
		if err != nil {
			return nil // skip unparseable go.mod files
		}

		for _, req := range f.Require {
			for _, prefix := range prefixes {
				if strings.HasPrefix(req.Mod.Path, prefix) {
					key := req.Mod.Path + "@" + req.Mod.Version
					seen[key] = true
					break
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to walk worktree: %w", err)
	}

	deps := make([]string, 0, len(seen))
	for dep := range seen {
		deps = append(deps, dep)
	}
	sort.Strings(deps)
	return deps, nil
}

// DownloadDeps downloads the given module@version strings into the exchange
// directory using `go mod download` with a custom GOMODCACHE.
// Returns the GOMODCACHE path that was used.
func DownloadDeps(deps []string, exchangeDir string) (string, error) {
	gomodcache := filepath.Join(exchangeDir, "gomodcache")

	args := append([]string{"mod", "download"}, deps...)
	cmd := osexec.Command("go", args...)
	cmd.Env = append(os.Environ(),
		"GOMODCACHE="+gomodcache,
		"GOPROXY=direct",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("go mod download failed: %s\n%s", err, strings.TrimSpace(string(out)))
	}
	return gomodcache, nil
}
