# Sandbox Push/Pull Design

## Context

We need a way to push work into the sandbox VM for autonomous plan execution and pull the results back. Git worktrees cannot be safely mounted into the VM, so we use git bundles as the transfer mechanism — symmetric in both directions.

## Overview

Two new commands: `cco box push` sends a plan into the sandbox for execution, `cco box pull` retrieves the results. A shared mount at `~/.local/share/cco/exchange/` provides the handoff point. Each session gets a unique ID to support parallel execution.

## Push Flow

**`cco box push <plan-path>`**

1. **Validate preconditions**: VM is running, plan file exists, working tree is clean (or warn if dirty)
2. **Generate session ID**: Short unique hex string (e.g. `a3f7b2`)
3. **Create exchange directory**: `~/.local/share/cco/exchange/<session-id>/`
4. **Create input bundle**: `git bundle create <exchange>/<session-id>/input.bundle <current-branch>`
5. **Clone from bundle inside VM**: `limactl shell cco-sandbox -- git clone /exchange/<session-id>/input.bundle /workspace/<session-id>`
6. **Invoke Claude interactively**:
   ```
   limactl shell cco-sandbox -- bash -c 'cd /workspace/<session-id> && claude --dangerously-skip-permissions "/executing-plans-in-sandbox <plan-path>"'
   ```
7. **Print session ID**: e.g. `Session a3f7b2 started. Pull with: cco box pull a3f7b2`

The push command blocks while Claude runs interactively — the user can watch output and intervene if needed.

## Pull Flow

**`cco box pull <session-id>`**

1. **Poll loop**: Check `~/.local/share/cco/exchange/<session-id>/output.bundle` every 2-3 seconds
2. **When found**:
   - `git bundle verify <bundle>` — ensure validity and prerequisite commits
   - `git fetch <bundle> <branch>` — fetch sandbox commits
   - Fast-forward merge onto current branch
3. **Report**: Print summary (new commits, files changed)
4. **Clean up**: Remove the `<session-id>` exchange subdirectory

**Error cases:**
- Bundle fails verification: error with message, leave bundle for debugging
- Fast-forward not possible: error, don't force merge, let user decide
- Timeout (configurable, default 30 min): give up with message

## Exchange Mount

**Lima template change** (`lima.yaml`):
- Add writable mount: host `~/.local/share/cco/exchange/` -> guest `/exchange/`
- Both host and VM read/write the same directory — no `limactl cp` needed for bundles
- Requires VM recreation to pick up the new mount

## Sandbox Execution Skill

**`executing-plans-in-sandbox.md`** — adapted from `executing-plans` with three changes:

1. **Autonomous**: no `AskUserQuestion`, no user prompts, no confirmation steps
2. **No `/complete-work`** at the end
3. **Final step**: `git bundle create /exchange/<session-id>/output.bundle HEAD`

The skill infers the session ID from the workspace directory path (`/workspace/<session-id>`).

## Provisioning

`sandbox.Provision()` is updated to also copy:
- `executing-plans-in-sandbox.md` -> `~/.claude/skills/executing-plans-in-sandbox.md` inside the VM

The skill file is embedded in the sandbox Go package alongside the existing CLAUDE.md and settings.json.

## Changes Summary

| Area | Change |
|------|--------|
| CLI commands | `cco box push <plan-path>`, `cco box pull <session-id>` |
| Go packages | Path helpers for exchange dir, session ID generation, push/pull logic |
| Lima template | Add writable mount `~/.local/share/cco/exchange/` -> `/exchange/` |
| Skill file | New `executing-plans-in-sandbox.md` (embedded in sandbox package) |
| Provisioning | Copy new skill into VM alongside existing config |
