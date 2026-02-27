# Design: Branch Deletion Flags for `cco rm`

## Context

`cco rm` currently removes the worktree and tmux window for a branch but does not delete the underlying git branch. Users must manually run `git branch -d` afterwards.

## Design

Add two new flags to `cco rm`, mirroring git's branch deletion semantics:

| Flag | Long             | Behavior                                            |
| ---- | ---------------- | --------------------------------------------------- |
| `-d` | `--delete`       | Delete the branch with `git branch -d` (safe)       |
| `-D` | `--force-delete` | Delete the branch with `git branch -D` (force)      |

Passing both `-d` and `-D` is an error.

### Execution order

1. Remove worktree (existing)
2. Close tmux window (existing)
3. Delete branch if `-d` or `-D` was passed (new)

The worktree must be removed before the branch can be deleted.

### Git client

One new method on `git.Client`:

```go
func (c *Client) DeleteBranch(repoRoot, branch string, force bool) error
```

- Runs `git branch -d` or `git branch -D` based on `force`.
- If the branch doesn't exist, logs debug and returns nil (idempotent).
- If `-d` fails due to unmerged commits, surfaces git's error message.

### Command changes

In `cmd/rm.go`:

- Add `deleteBranch` and `forceDeleteBranch` bool flags.
- Pass them through to `WorkspaceService.Remove()`.

### Service changes

`workspace.Service.Remove()` gains two new parameters (or an options struct):

```go
func (s *Service) Remove(repoRoot, branch string, deleteBranch, forceDelete bool) error
```

After existing cleanup, if `deleteBranch || forceDelete`, call `s.git.DeleteBranch(repoRoot, branch, forceDelete)`.

### Updated help text

```
Remove the workspace (worktree + window) for a branch.

Skips any steps which have already been completed.
Does NOT delete the branch itself unless -d or -D is passed.
Must be run from the main repository, not a worktree.
```
