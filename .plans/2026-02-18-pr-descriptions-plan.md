# Better PR Descriptions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Teach Claude Code to write better pull request descriptions with context, motivation, and reviewer guidance.

**Architecture:** Add PR description guidance to the global CLAUDE.md (single source of truth) and remove the conflicting hardcoded template from the completing-work skill.

**Tech Stack:** Markdown configuration files

---

### Task 1: Add PR description guidance to global CLAUDE.md

**Files:**
- Modify: `claude/CLAUDE.md:51-58` (add new section after "Asking Questions")

**Step 1: Add the new section**

Append the following after the `## Asking Questions` section (after line 58) in `claude/CLAUDE.md`:

```markdown

## Pull Request Descriptions

**Title:** `TICKET-123: short description` if ticket available, otherwise conventional commit format. Under 70 characters.

**Body:**

```
## Context
- Why this change exists and what was wrong/missing before
- Link to ticket or design doc if available

## Changes
- What changed, grouped by concept (not file-by-file)

## Review Notes
- Non-obvious decisions, alternatives rejected, areas needing careful review
- Omit section if changes are straightforward

## Test Plan
- [ ] Steps to verify the changes work
```

**Key principles:**
- Explain *why*, not *how* — the diff already shows how
- Write for future readers, not just the current reviewer
- Be specific ("handles expired sessions mid-request") not vague ("fixes edge case")
- Don't substitute a ticket link for actual motivation
```

**Step 2: Verify the file looks correct**

Read `claude/CLAUDE.md` and confirm:
- The new `## Pull Request Descriptions` section appears after `## Asking Questions`
- The template code block renders correctly
- No broken markdown

**Step 3: Commit**

```bash
git add claude/CLAUDE.md
git commit -m "feat: add PR description guidance to global CLAUDE.md"
```

---

### Task 2: Remove hardcoded PR template from completing-work skill

**Files:**
- Modify: `claude/skills/completing-work/SKILL.md:139-154` (simplify the gh pr create example)

**Step 1: Simplify the PR creation example**

In `claude/skills/completing-work/SKILL.md`, replace the current "Option 1: Push and Create PR" section (lines 139-154):

```markdown
#### Option 1: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR in draft mode
gh pr create --draft --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```
```

With:

```markdown
#### Option 1: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create draft PR
gh pr create --draft
```
```

**Step 2: Verify the file looks correct**

Read `claude/skills/completing-work/SKILL.md` and confirm:
- The `gh pr create` command no longer includes an inline body template
- The rest of the skill is unchanged

**Step 3: Commit**

```bash
git add claude/skills/completing-work/SKILL.md
git commit -m "refactor(completing-work): remove hardcoded PR template"
```

---

### Task 3: Update documentation

**Files:**
- Modify: `README.md` (if it references the PR template format)
- Modify: `CLAUDE.md` (project CLAUDE.md, if it references PR format)

**Step 1: Check for stale references**

Search `README.md` and the project `CLAUDE.md` for references to "Summary", "Test Plan" in the context of PR creation. If any references describe the old PR format, update them. If no references exist, skip this task.

**Step 2: Commit (if changes were made)**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update PR description references"
```

<!-- If no documentation updates needed, skip this task entirely -->
