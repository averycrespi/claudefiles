# Dashboard

How to read and update the active state dashboard.

## Location

The dashboard lives at `~/steven-vault/system/dashboard.md`.

## Reading

When Avery asks "what am I working on?", "what's active?", or similar:

1. Read `system/dashboard.md`
2. Present the current state conversationally — don't dump the raw file
3. Highlight anything that looks stale or needs attention

## Updating

### When to Update

- Avery mentions completing a to-do — check it off
- New to-dos come from daily notes or conversation — add them
- Project status changes — update Active Projects
- New decisions are made — add to Recent Decisions
- Avery shifts focus — update Current Focus

### How to Update

- Update the `updated` date in frontmatter whenever the dashboard changes
- Keep Current Focus to 1-3 items maximum
- Mark completed to-dos with `[x]` and a completion date
- Remove completed to-dos after ~1 week
- Remove stale entries from Recent Decisions after ~2 weeks
- After updating, re-embed: `qmd embed`

## Format Reference

```markdown
---
updated: YYYY-MM-DD
---

# Dashboard

## Current Focus
Top 1-3 things Avery is focused on right now.

## Active Projects
Projects and their current status (in progress, on hold, discovery, etc.).

## In-Flight Work
Open PRs, pending reviews, things waiting on others.

## To-Dos
- [ ] Open action items with date they were captured
- [x] Recently completed items (keep for ~1 week, then remove)

## Recent Decisions
Key decisions from the last 1-2 weeks with dates.
```
