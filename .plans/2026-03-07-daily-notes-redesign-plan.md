# Daily Notes Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Replace the structured session digest format with a flat rolling checklist, and remove the dashboard entirely.

**Architecture:** Three files are rewritten, one deleted, and two docs updated. All changes are to markdown reference/doc files — no code, no tests.

**Tech Stack:** Markdown

---

### Task 1: Rewrite `references/daily-notes.md`

**Files:**
- Modify: `claude/skills/steven/references/daily-notes.md` (full rewrite)

**Step 1: Replace the file contents**

Write `claude/skills/steven/references/daily-notes.md`:

```markdown
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
```

**Step 2: Commit**

```bash
git add claude/skills/steven/references/daily-notes.md
git commit -m "feat(steven): rewrite daily notes as rolling checklist"
```

### Task 2: Delete `references/dashboard.md`

**Files:**
- Delete: `claude/skills/steven/references/dashboard.md`

**Step 1: Delete the file**

```bash
rm claude/skills/steven/references/dashboard.md
```

**Step 2: Commit**

```bash
git add claude/skills/steven/references/dashboard.md
git commit -m "feat(steven): remove dashboard reference"
```

### Task 3: Update `SKILL.md` intent routing

**Files:**
- Modify: `claude/skills/steven/SKILL.md:1-56`

**Step 1: Update the startup section**

Replace:

```markdown
On every invocation, read these files for orientation:

1. `~/steven-vault/system/identity.md` — who Steven is and how to operate
2. `~/steven-vault/system/dashboard.md` — what Avery is currently focused on
```

With:

```markdown
On every invocation, read this file for orientation:

1. `~/steven-vault/system/identity.md` — who Steven is and how to operate
```

**Step 2: Update the vault directory description**

Replace:

```markdown
- `system/` — identity, rules, dashboard (Steven's operating files)
```

With:

```markdown
- `system/` — identity and rules (Steven's operating files)
```

**Step 3: Update intent routing**

Replace:

```markdown
- **Daily notes** — Avery wants to write a session digest, read what happened on
  a given day, or review recent activity. Load `references/daily-notes.md`.
- **Dashboard and priorities** — Avery asks about current state, what's active,
  to-dos, or wants to update focus areas. Load `references/dashboard.md`.
```

With:

```markdown
- **Daily notes and priorities** — Avery wants to add items, check things off,
  see what's on the plate, read what happened on a given day, or review recent
  activity. Load `references/daily-notes.md`.
```

**Step 4: Commit**

```bash
git add claude/skills/steven/SKILL.md
git commit -m "feat(steven): remove dashboard from SKILL.md routing"
```

### Task 4: Update `references/ingest.md` — remove dashboard step

**Files:**
- Modify: `claude/skills/steven/references/ingest.md:34-35`

**Step 1: Remove step 8**

Delete lines 34-35 (the "Update the dashboard" step). No renumbering needed
since it's the last step.

**Step 2: Commit**

```bash
git add claude/skills/steven/references/ingest.md
git commit -m "chore(steven): remove dashboard step from ingest workflow"
```

### Task 5: Update `steven/ARCHITECTURE.md`

**Files:**
- Modify: `steven/ARCHITECTURE.md:1-43`

**Step 1: Update the ASCII diagram**

Replace:

```
│  System Files │
│  identity.md  │
│  rules.md     │
│  dashboard.md │
```

With:

```
│  System Files │
│  identity.md  │
│  rules.md     │
│               │
```

**Step 2: Update the skill description**

Replace:

```markdown
**The `/steven` skill** — Single entry point for all interactions. Handles intent routing via natural language — determines whether the user wants to save, recall, search, write daily notes, check the dashboard, or trigger ingestion. Defined at `claude/skills/steven/SKILL.md` with five reference files for detailed workflows.
```

With:

```markdown
**The `/steven` skill** — Single entry point for all interactions. Handles intent routing via natural language — determines whether the user wants to save, recall, search, write daily notes, or trigger ingestion. Defined at `claude/skills/steven/SKILL.md` with four reference files for detailed workflows.
```

**Step 3: Update the system files description**

Replace:

```markdown
**System files** — Steven's self-knowledge: `identity.md` (name, operating style), `rules.md` (behavioral guardrails, memory hygiene), and `dashboard.md` (active projects, priorities, to-dos). Read on every invocation for orientation.
```

With:

```markdown
**System files** — Steven's self-knowledge: `identity.md` (name, operating style) and `rules.md` (behavioral guardrails, memory hygiene). Read on every invocation for orientation. Active items and priorities live in daily notes.
```

**Step 4: Commit**

```bash
git add steven/ARCHITECTURE.md
git commit -m "docs(steven): remove dashboard from architecture"
```

### Task 6: Update `steven/README.md`

**Files:**
- Modify: `steven/README.md:1-88`

**Step 1: Update the vault directory tree**

Replace:

```
├── system/       # Identity, rules, dashboard (Steven's operating files)
```

With:

```
├── system/       # Identity and rules (Steven's operating files)
```

**Step 2: Update the skill routing description**

Replace:

```markdown
The skill routes your intent to the appropriate workflow (remember, search, daily notes, dashboard, or ingest) and reads the vault for context before responding.
```

With:

```markdown
The skill routes your intent to the appropriate workflow (remember, search, daily notes, or ingest) and reads the vault for context before responding.
```

**Step 3: Update the example commands**

Replace:

```
/steven what am I working on right now?
```

With:

```
/steven what's on my plate?
```

**Step 4: Commit**

```bash
git add steven/README.md
git commit -m "docs(steven): remove dashboard references from README"
```

<!-- No test updates needed — all changes are to markdown reference and documentation files -->
