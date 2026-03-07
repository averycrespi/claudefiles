# Daily Notes Redesign

## Context

The Steven daily notes reference prescribed a structured session digest format
with headers, subsections (Context, Decisions, Facts Learned, To-Dos, etc.),
and narrative-style entries. This doesn't match how Avery actually takes daily
notes — a flat rolling checklist with freeform prefix tags.

The dashboard (`system/dashboard.md`) is also being removed. Daily notes absorb
the role of tracking open action items.

## Design

### Format

Daily notes are a flat checklist at `~/steven-vault/daily/YYYY-MM-DD.md`. No
headers, no sections — just checkbox items, one per line. Each item starts with
a freeform prefix that categorizes it (e.g., `TODO:`, `Context:`, `Note:`,
`Idea:`, `Cleanup:`, `Feedback:`). Steven picks whatever prefix fits naturally.

```markdown
- [ ] TODO: create ticket for runbook updates
- [ ] Context: frontend team starting new feature soon
- [x] TODO: merge bug fixes into main service
- [ ] Idea: try GitHub integration for tooling
```

### Carry Forward

When creating a new day's note, Steven reads the most recent previous daily note
and copies all unchecked (`- [ ]`) items into today's file. Checked items stay
in the old day's file and don't carry forward.

The current day's note is always the canonical list of open items. Old daily
notes become a historical record of what was completed on that day.

When Steven adds new items during a session, it appends to today's note. If
today's note doesn't exist yet, Steven creates it by carrying forward first,
then adding new items.

### Checking Off Items

Steven can mark items as done (`[x]`) if it has clear evidence — a PR was
merged, a ticket was closed, Avery said it's done, etc. Otherwise, only Avery
checks things off.

### Removing the Dashboard

The dashboard (`system/dashboard.md`) is removed entirely. Daily notes own
action items, knowledge files capture decisions and context. The dashboard
reference file and its intent routing entry in SKILL.md are deleted.

If Avery asks "what am I working on?" or "what's active?", Steven reads the
current day's daily note.

### Reading Past Notes

For temporal queries ("what happened last Tuesday?"), Steven finds the daily
note(s) by date and summarizes. Items are self-describing via prefix tags, so
Steven groups and presents them conversationally.

For "what's on my plate?", Steven reads today's note — all open items are there
by definition.

## Changes Required

1. Rewrite `references/daily-notes.md` to match the new format
2. Delete `references/dashboard.md`
3. Update `SKILL.md` intent routing to remove dashboard, redirect priority
   queries to daily notes
