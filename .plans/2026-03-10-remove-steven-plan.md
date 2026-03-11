# Remove Steven Assistant — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Remove all Steven assistant references from the codebase while preserving `.plans/` and the launchd skill.

**Architecture:** Pure deletion/cleanup — remove the `steven/` directory, the `asking-steven` skill, and scrub references from settings, README, and docs.

**Tech Stack:** Git, bash (rm)

---

### Task 1: Delete steven directory and asking-steven skill

**Files:**
- Delete: `steven/README.md`
- Delete: `steven/ARCHITECTURE.md`
- Delete: `steven/scripts/run.sh`
- Delete: `claude/skills/asking-steven/SKILL.md`
- Delete: `claude/skills/asking-steven/references/remember.md`
- Delete: `claude/skills/asking-steven/references/search.md`
- Delete: `claude/skills/asking-steven/references/daily-notes.md`
- Delete: `claude/skills/asking-steven/references/ingest.md`

**Step 1: Delete the directories**

```bash
rm -rf steven/ claude/skills/asking-steven/
```

**Step 2: Verify deletion**

```bash
ls steven/ 2>&1        # Expected: "No such file or directory"
ls claude/skills/asking-steven/ 2>&1  # Expected: "No such file or directory"
```

**Step 3: Commit**

```bash
git add steven/ claude/skills/asking-steven/
git commit -m "chore: remove steven directory and asking-steven skill"
```

### Task 2: Remove Steven references from settings.json

**Files:**
- Modify: `claude/settings.json:7,10,92,94,196`

**Step 1: Edit settings.json**

Remove these lines from the `permissions.allow` array:
- Line 7: `"Read(~/steven-vault/**)",`
- Line 10: `"Write(~/steven-vault/**)",`
- Line 92: `"Bash(qmd:*)",`
- Line 94: `"Skill(asking-steven)",`

Remove from the `sandbox.excludedCommands` array:
- Line 196: `"qmd:*"`

After edits, the relevant sections should look like:

```json
"allow": [
  "WebFetch",
  "WebSearch",
  "Read(~/.claude/skills/**)",
  "Write(/private/tmp/**)",
  "Write(/tmp/**)",
  "Bash(cd:*)",
  ...
```

And the skills section:

```json
  "Skill(automating-browsers)",
  "Skill(brainstorming)",
  ...
```

And the sandbox excludedCommands should no longer contain `"qmd:*"`.

**Step 2: Verify JSON is valid**

```bash
jq . claude/settings.json > /dev/null
```

Expected: no output (valid JSON).

**Step 3: Commit**

```bash
git add claude/settings.json
git commit -m "chore: remove steven-vault and qmd permissions"
```

### Task 3: Remove Steven references from README.md

**Files:**
- Modify: `README.md:10,17`

**Step 1: Edit README.md**

Remove line 10 (the Steven feature bullet):
```
- **[Steven](steven/README.md)** — Persistent work assistant with long-term memory
```

Edit line 17 to remove `and `steven`` — change:
```
- [Node.js](https://nodejs.org/) 18+ for `automating-browsers` and `steven`
```
to:
```
- [Node.js](https://nodejs.org/) 18+ for `automating-browsers`
```

**Step 2: Verify the file reads correctly**

Read `README.md` and confirm the Features section has 3 bullets and Node.js line no longer mentions steven.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: remove steven references from README"
```

### Task 4: Remove Steven references from docs

**Files:**
- Modify: `docs/skills.md:25`
- Modify: `docs/integrations.md:70-74`

**Step 1: Edit docs/skills.md**

Remove line 25 (the asking-steven row from the Integrations table):
```
| `asking-steven` | Persistent work assistant with long-term memory |
```

**Step 2: Edit docs/integrations.md**

Remove the entire "Steven (Personal Work Assistant)" section at the bottom (lines 70-74):
```
## Steven (Personal Work Assistant)

A persistent work assistant accessible from any Claude Code session via `/asking-steven`. Steven maintains long-term memory across sessions using an Obsidian vault and [QMD](https://github.com/tobi/qmd) semantic search — saving decisions, surfacing context, and pulling data from Jira and Confluence on a schedule.

See the [Steven README](../steven/README.md) for setup, usage, and architecture details.
```

**Step 3: Verify both files**

Read `docs/skills.md` and `docs/integrations.md` to confirm no steven references remain.

**Step 4: Commit**

```bash
git add docs/skills.md docs/integrations.md
git commit -m "docs: remove steven from skills catalog and integrations"
```

<!-- No documentation updates needed beyond the doc edits already included in tasks 3-4 -->
