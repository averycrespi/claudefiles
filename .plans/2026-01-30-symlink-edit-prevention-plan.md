# Symlink Edit Prevention Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Prevent Claude from editing files in `~/.claude/` instead of source files in this repository.

**Architecture:** Two-part approach - documentation in CLAUDE.md explains the constraint, deny rules in .claude/settings.json enforce it.

**Tech Stack:** Markdown, JSON

---

### Task 1: Update CLAUDE.md with Warning

**Files:**
- Modify: `CLAUDE.md:122-127` (the "Modifying This Repository" section)

**Step 1: Add the warning to CLAUDE.md**

Append to the "Modifying This Repository" section:

```markdown
**IMPORTANT:** Never edit files directly in `~/.claude/`. Those are symlinks managed by stow. Always edit the source files in this repository's `claude/` directory. For example:
- Edit `./claude/skills/foo.md`, NOT `~/.claude/skills/foo.md`
- Edit `./claude/settings.json`, NOT `~/.claude/settings.json`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE.md): add warning about editing symlinked files"
```

---

### Task 2: Add Deny Rules to Project Settings

**Files:**
- Modify: `.claude/settings.json`

**Step 1: Add deny rules**

Update `.claude/settings.json` to:

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

**Step 2: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(.claude): deny writes to ~/.claude/ in this repo"
```

---

### Task 3: Verify Setup

**Step 1: Confirm both files are correctly modified**

Run:
```bash
grep -A5 "IMPORTANT:" CLAUDE.md
cat .claude/settings.json
```

Expected: See the warning text and the deny rules in output.

**Step 2: Test that permissions work (optional manual test)**

Try to edit `~/.claude/CLAUDE.md` - should be blocked by permissions.
