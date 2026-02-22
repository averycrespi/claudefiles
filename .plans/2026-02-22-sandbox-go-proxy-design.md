# Sandbox Go Proxy Design

## Problem

When running Go projects inside the sandbox VM (via `cco box push`), private Go module dependencies cannot be resolved. The sandbox has no access to private repositories, and granting additional credentials/permissions into the sandbox is undesirable.

## Solution

Use a file-system based Go module proxy. At push time, private dependencies are downloaded on the host (which has credentials) and placed in the shared exchange directory. Inside the sandbox, `GOPROXY` is configured to check this local cache first before falling back to the public proxy.

This works because Go's module cache (`$GOMODCACHE/cache/download`) uses the exact same directory layout as the GOPROXY protocol. No special tooling is needed — `go mod download` populates the cache, and `GOPROXY=file:///path` reads it.

## Configuration

A global cco config file at `$XDG_CONFIG_HOME/cco/config.json` (defaults to `~/.config/cco/config.json`):

```json
{
  "go_proxy": {
    "private_patterns": [
      "github.com/myorg/*",
      "github.com/other-private-org/*"
    ]
  }
}
```

Patterns use the same glob format as Go's `GONOSUMCHECK` and `GOPRIVATE` environment variables. For matching against `go.mod` requires, the trailing `/*` is stripped and the remainder is used as a prefix match. For `GONOSUMCHECK`, patterns are passed through as-is. If `go_proxy` is absent or `private_patterns` is empty, the feature is a no-op.

### Config CLI Commands

| Command | Behavior |
|---------|----------|
| `cco config path` | Print the resolved config file path to stdout |
| `cco config show` | Print config contents (or a message if the file doesn't exist yet) |
| `cco config edit` | Open config in `$EDITOR` (falls back to `vi`). Create the file with `{}` if it doesn't exist |

These are general-purpose config commands, not Go-proxy-specific.

## Host-Side Push Flow

When `cco box push` runs and the config has `go_proxy.private_patterns`, a new step happens after the git bundle is created but before the tmux pane is split.

### Step 1: Find Private Dependencies

Glob for all `**/go.mod` files in the worktree. For each one, parse the `require` directives and check if the module path starts with any configured pattern. Collect all matching `module@version` pairs, deduplicating by module+version across all `go.mod` files.

### Step 2: Download to Exchange Directory

If there are matches, run:

```bash
GOMODCACHE=~/.local/share/cco/exchange/{jobID}/gomodcache \
GOPROXY=direct \
go mod download github.com/myorg/foo@v1.2.3 github.com/myorg/bar@v0.4.0
```

- `GOMODCACHE` points to the job's exchange directory, so the cache lands on the shared mount automatically
- `GOPROXY=direct` forces fetching from source using the host's git credentials
- `go mod download` accepts multiple `module@version` arguments in a single invocation
- The resulting `gomodcache/cache/download/` directory is already in the exact GOPROXY protocol layout — no transformation needed

### Step 3: No Cleanup Needed

The gomodcache directory lives inside `/exchange/{jobID}/` and gets cleaned up with the job.

If no `go.mod` exists in the worktree, or no dependencies match, this step is silently skipped.

## Guest-Side GOPROXY Configuration

When building the launch command in `Service.Prepare()`, if a gomodcache directory exists in the job's exchange dir, inject environment variables:

```bash
GOPROXY=file:///exchange/{jobID}/gomodcache/cache/download,https://proxy.golang.org,direct \
GONOSUMCHECK=github.com/myorg/*,github.com/other-private-org/* \
# ^ patterns passed through directly from config
cd /workspace/{jobID} && claude --dangerously-skip-permissions "/executing-plans .plans/plan.md"
```

### Fallback Chain

1. `file:///exchange/{jobID}/gomodcache/cache/download` — local file-system proxy. Private modules are found here.
2. `https://proxy.golang.org` — public proxy for public dependencies. Reached on 404 (module not in local cache).
3. `direct` — last resort, fetch from source via VCS.

### Why GONOSUMCHECK (not GOPRIVATE)

- `GOPRIVATE` sets both `GONOSUMCHECK` and `GONOPROXY`. Setting `GONOPROXY` would tell Go to bypass our file-system proxy and try to `git clone` directly, which would fail in the sandbox.
- `GONOSUMCHECK` alone skips checksum verification for private modules (which aren't in the public sum database) while still using the proxy chain.

### Detection

Before building the launch command, check if `~/.local/share/cco/exchange/{jobID}/gomodcache/cache/download` exists on the host. If it does, add the env vars. If not, the launch command is unchanged — fully backwards compatible.

## Implementation

### New Files

| File | Purpose |
|------|---------|
| `orchestrator/cmd/config.go` | `cco config path/show/edit` subcommands |
| `orchestrator/internal/config/config.go` | Config loading, parsing, path resolution |
| `orchestrator/internal/goproxy/goproxy.go` | Scan worktree for private deps, run `go mod download` |

### Modified Files

| File | Change |
|------|--------|
| `orchestrator/cmd/root.go` | Register `config` subcommand |
| `orchestrator/internal/sandbox/sandbox.go` | In `Prepare()`: call goproxy to cache deps, inject env vars into launch command |
| `orchestrator/internal/paths/paths.go` | Add `ConfigDir()` and `ConfigFilePath()` helpers |
| `orchestrator/README.md` | Add Configuration section documenting config file and commands |

### Package Responsibilities

- **`config`** — Reads `$XDG_CONFIG_HOME/cco/config.json`. Exposes `Load() (*Config, error)` and the struct with `GoProxy.PrivatePatterns []string`.
- **`goproxy`** — `CachePrivateDeps(worktreeDir, exchangeDir string, patterns []string) error`. Globs for `**/go.mod`, parses requires, filters by patterns, deduplicates, runs `go mod download` with custom `GOMODCACHE`. Returns nil (no-op) if no matches.

### README Changes

Add a new "Configuration" section to `orchestrator/README.md` documenting:
- Config file location and format
- The `go_proxy.private_patterns` option with explanation and example
- The `cco config path/show/edit` commands
