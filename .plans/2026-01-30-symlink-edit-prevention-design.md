# Symlink Edit Prevention Design

**Date:** 2026-01-30
**Status:** Approved

## Problem

When working in this repository, Claude Code sometimes tries to edit files at `~/.claude/` instead of the source files in the `claude/` directory. Since `~/.claude/` is symlinked to `claude/` via stow, this causes confusion and potential issues.

## Solution

Use a belt-and-suspenders approach with both documentation and permissions:

1. **Documentation** - Instructions in CLAUDE.md explain the why
2. **Permissions** - Deny rules in .claude/settings.json enforce it

## Changes

### 1. CLAUDE.md (Root)

Add to the "Modifying This Repository" section:

```markdown
**IMPORTANT:** Never edit files directly in `~/.claude/`. Those are symlinks managed by stow. Always edit the source files in this repository's `claude/` directory. For example:
- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./claude/settings.json`, NOT `~/.claude/settings.json`
```

### 2. .claude/settings.json (Project-Local)

Update the deny array:

```json
{
  "permissions": {
    "allow": [],
    "deny": [
      "Write(~/.claude/**)",
      "Edit(~/.claude/**)"
    ]
  }
}
```

## Notes

- We do NOT block `Read(~/.claude/**)` since Claude may legitimately need to read skills or settings during execution
- The `.claude/settings.json` is project-local, so this restriction only applies when working in this repository
- The `claude/settings.json` (no dot) is the global settings that gets symlinked - we don't modify that
