# Daily Notes

How to write and read daily session digests.

## Location

Daily notes live at `~/steven-vault/daily/YYYY-MM-DD.md`.

## Writing a Session Digest

Append to the day's note (don't overwrite previous entries). If the file
doesn't exist yet, create it with a date header first.

### Format

```markdown
## Session — HH:MM

### Context
What was worked on this session.

### Decisions
Key decisions made and why.

### Facts Learned
New information worth remembering.

### To-Dos
- [ ] Action items that came up during the session

### Related Projects
Projects touched or discussed.

### Keywords
Terms for future searchability.
```

### Rules

- Use the current time for the session header
- Each section is optional — omit sections with nothing to report
- Keep entries concise — this is a log, not a narrative
- When to-dos are captured, also add them to `system/dashboard.md`
- After writing, re-embed: `qmd embed`

## Reading Past Notes

For temporal queries ("what happened last Tuesday?", "what did I work on
this week?"):

1. Find the corresponding daily note file(s) by date
2. Read the file(s) and summarize the sessions
3. For week-range queries, read multiple daily notes and synthesize
