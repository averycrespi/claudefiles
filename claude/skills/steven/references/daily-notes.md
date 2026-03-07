# Daily Notes

How to write and read the rolling daily checklist.

## Location

Daily notes live at `~/steven-vault/daily/YYYY-MM-DD.md`.

## Format

Each daily note is a flat checklist — no headers, no sections. One checkbox
item per line, prefixed with a freeform category tag.

```markdown
- [ ] TODO: create ticket for runbook updates
- [ ] Context: frontend team starting new feature soon
- [x] TODO: merge bug fixes into main service
- [ ] Idea: try GitHub integration for tooling
```

Steven picks whatever prefix fits the item naturally (e.g., `TODO:`,
`Context:`, `Note:`, `Idea:`, `Cleanup:`, `Feedback:`, `Upcoming:`). There
is no fixed set — use what makes sense.

## Carry Forward

When creating a new day's note:

1. Find the most recent previous daily note in `~/steven-vault/daily/`
2. Copy all unchecked (`- [ ]`) items into today's file
3. Leave checked items in the old file — they don't carry forward

If today's note doesn't exist yet, create it by carrying forward first,
then append any new items.

The current day's note is always the canonical list of open items.

## Adding Items

Append new items to today's note. If today's note doesn't exist, create it
via carry forward first, then append.

After writing, re-embed: `qmd embed`

## Checking Off Items

Steven can mark items as done (`[x]`) when there is clear evidence — a PR
was merged, a ticket was closed, Avery said it's done. Otherwise, only Avery
checks things off.

## Reading Past Notes

For temporal queries ("what happened last Tuesday?", "what did I work on
this week?"):

1. Find the corresponding daily note file(s) by date
2. Read the file(s) and summarize — items are self-describing via their
   prefix tags, so group and present them conversationally

For "what's on my plate?" or "what am I working on?", read today's note —
all open items are there by definition.
