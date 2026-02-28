# Design: Shallow Git Bundles for Sandbox Push/Pull

## Problem

The CCOBox push/pull workflow creates git bundles containing the **entire repository history**. For repos with long histories, this makes bundle creation slow and produces unnecessarily large files. The sandbox only needs recent history (~100 commits) for plan execution.

## Solution

Create a shallow clone before bundling. The shallow clone limits history depth, and the resulting bundle inherits only the shallow history.

## Changes

### Input Bundle (Push: Host → Sandbox)

**Current:**
```
git bundle create input.bundle <branch>
```

**New:**
```
git clone --depth <N> --single-branch --branch <branch> <repoRoot> <tmpDir>
git -C <tmpDir> bundle create input.bundle HEAD
rm -rf <tmpDir>
```

The shallow clone is local (fast) and the resulting bundle is dramatically smaller.

### Output Bundle (Pull: Sandbox → Host)

**No changes needed.** The sandbox workspace was cloned from a shallow bundle, so it already has limited history. The output bundle inherits this automatically. The host-side pull (`git fetch` + `git merge --ff-only`) works correctly because the host has full history (a superset of what's in the bundle).

### CLI Flag

Add `--depth` flag to `cco box push`:

```
cco box push --depth 100   # default
cco box push --depth 50    # more aggressive
cco box push --depth 0     # full history (current behavior)
```

## Implementation

### 1. `box_push.go` — Add depth flag

```go
var depth int
cmd.Flags().IntVar(&depth, "depth", 100, "number of commits to include in bundle (0 for full history)")
```

Pass `depth` to `svc.Prepare()`.

### 2. `sandbox.go` — Update `Prepare()` signature

```go
func (s *Sandbox) Prepare(repoRoot, planPath string, depth int) (*Job, error)
```

### 3. `sandbox.go` — Shallow clone before bundling

Replace direct bundle creation with:

```go
bundlePath := filepath.Join(exchangeDir, "input.bundle")

if depth > 0 {
    // Create shallow clone, bundle from it
    tmpClone := filepath.Join(os.TempDir(), "cco-shallow-"+job.ID)
    defer os.RemoveAll(tmpClone)

    depthStr := strconv.Itoa(depth)
    if out, err := s.runner.Run("git", "clone",
        "--depth", depthStr,
        "--single-branch", "--branch", branch,
        repoRoot, tmpClone); err != nil {
        return nil, fmt.Errorf("shallow clone failed: %s", strings.TrimSpace(string(out)))
    }

    if out, err := s.runner.RunDir(tmpClone, "git", "bundle", "create",
        bundlePath, "HEAD"); err != nil {
        return nil, fmt.Errorf("git bundle create failed: %s", strings.TrimSpace(string(out)))
    }
} else {
    // Full history (original behavior)
    if out, err := s.runner.RunDir(repoRoot, "git", "bundle", "create",
        bundlePath, branch); err != nil {
        return nil, fmt.Errorf("git bundle create failed: %s", strings.TrimSpace(string(out)))
    }
}
```

### 4. No changes to:

- `box_pull.go` / `Pull()` — fetch + ff-only merge works regardless of bundle depth
- Sandbox skill (`SKILL.md`) — output bundle inherits shallow history automatically
- Lima VM config — exchange mount unchanged

## Edge Cases

- **Depth > total commits:** `git clone --depth` handles this gracefully — clones everything available
- **Depth = 0:** Falls back to full history (original behavior), useful as an escape hatch
- **Submodules:** Not affected — bundles don't include submodules regardless

## Testing

- Verify shallow bundle creates successfully and is smaller than full bundle
- Verify `git clone` from shallow bundle works in sandbox
- Verify output bundle from sandbox can be fetched and merged on host
- Verify `--depth 0` preserves original behavior
- Test with repo that has fewer commits than depth value
