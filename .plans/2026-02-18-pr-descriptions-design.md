# Better PR Descriptions — Design

## Problem

PR descriptions created by Claude Code are bland and lack context. The current `completing-work` skill uses a minimal template (Summary + Test Plan) that describes *what* changed but not *why*.

## Solution

Two changes:

### 1. Add PR description guidance to global CLAUDE.md

New `## Pull Request Descriptions` section with title rules, body template, and writing principles.

```markdown
## Pull Request Descriptions

**Title:** `TICKET-123: short description` if ticket available, otherwise conventional commit format. Under 70 characters.

**Body:**

\```
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
\```

**Key principles:**
- Explain *why*, not *how* — the diff already shows how
- Write for future readers, not just the current reviewer
- Be specific ("handles expired sessions mid-request") not vague ("fixes edge case")
- Don't substitute a ticket link for actual motivation
```

### 2. Remove hardcoded template from completing-work skill

Replace the `gh pr create` example that includes an inline `## Summary` / `## Test Plan` body with just the bare command — no prescribed body format. CLAUDE.md guidance will be in context automatically.

## Files Changed

| File | Change |
|------|--------|
| `claude/CLAUDE.md` | Add `## Pull Request Descriptions` section |
| `claude/skills/completing-work/SKILL.md` | Remove hardcoded PR body template from `gh pr create` example |
