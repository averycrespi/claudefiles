# Steven Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Build the `/steven` skill — a persistent work assistant backed by an Obsidian vault and QMD semantic search.

**Architecture:** A single skill (`/steven`) with a thin SKILL.md for identity and intent routing, five reference files for detailed workflows, and an Obsidian vault at `~/steven-vault` with system files, daily notes, and flat tagged knowledge files. QMD provides semantic search over the vault.

**Tech Stack:** Claude Code skills (markdown), QMD (Node.js CLI for semantic search), Obsidian vault (plain markdown + YAML frontmatter)

---

### Task 1: Install QMD

**Files:**
- None (system-level installation)

**Step 1: Install QMD globally via npm**

Run: `npm install -g @tobilu/qmd`
Expected: QMD installed successfully

**Step 2: Verify installation**

Run: `qmd --help`
Expected: QMD help output showing available commands including `search`, `vsearch`, `query`, `collection`, `embed`

**Step 3: Commit**

No files to commit — system-level installation only.

---

### Task 2: Create the Obsidian Vault

**Files:**
- Create: `~/steven-vault/system/identity.md`
- Create: `~/steven-vault/system/rules.md`
- Create: `~/steven-vault/system/dashboard.md`
- Create: `~/steven-vault/daily/.gitkeep`
- Create: `~/steven-vault/knowledge/.gitkeep`

**Step 1: Create the vault directory structure**

Run: `mkdir -p ~/steven-vault/system ~/steven-vault/daily ~/steven-vault/knowledge`

**Step 2: Write `system/identity.md`**

```markdown
---
source: manual
type: note
date: 2026-03-07
---

# Steven

Steven is a persistent work assistant accessible from any Claude Code session.

## Who Avery Is

Avery is a software engineer. Steven assists Avery with work context — tracking
decisions, surfacing relevant knowledge, maintaining awareness of active projects
and priorities.

## Operating Style

- Concise and professional
- Proactively connects dots across knowledge — surfaces related context without
  being asked when it's relevant to the current question
- Surfaces contradictions when noticed — if new information conflicts with
  something already stored, flags it rather than silently accepting
- Asks rather than assumes — when intent is ambiguous, clarifies before acting
- Summarizes decisively — captures substance and conclusions, not verbatim
  conversation
```

**Step 3: Write `system/rules.md`**

```markdown
---
source: manual
type: note
date: 2026-03-07
---

# Rules

Behavioral guardrails for Steven.

## Memory Hygiene

- Don't save speculative conclusions from a single data point
- Fix facts at the source when corrected — update existing files, don't add a
  new contradicting one
- Prefer updating existing files over creating duplicates
- Don't store credentials, personal data, or raw dumps without summarization

## Tagging Standards

- Always include `source`, `type`, and `date` in frontmatter
- Include `project` when the knowledge relates to a specific project
- Include `tags` for topic-level searchability

## Summarization

- Concise and decision-focused
- Capture the "what was decided and why" not "what was discussed"
- Include enough context for future recall without the original conversation
```

**Step 4: Write `system/dashboard.md`**

```markdown
---
updated: 2026-03-07
---

# Dashboard

## Current Focus

_No current focus set._

## Active Projects

_No active projects tracked yet._

## In-Flight Work

_No in-flight work tracked yet._

## To-Dos

_No to-dos yet._

## Recent Decisions

_No recent decisions recorded._
```

**Step 5: Create placeholder files for empty directories**

Run: `touch ~/steven-vault/daily/.gitkeep ~/steven-vault/knowledge/.gitkeep`

**Step 6: Commit**

No files in the repo to commit — the vault lives at `~/steven-vault` outside the repo.

---

### Task 3: Register the Vault as a QMD Collection

**Files:**
- None (QMD configuration)

**Step 1: Add the vault as a QMD collection**

Run: `qmd collection add ~/steven-vault --name steven`
Expected: Collection `steven` created

**Step 2: Add context description**

Run: `qmd context add qmd://steven "Work knowledge base — decisions, meetings, tickets, learnings, daily notes, and project context"`
Expected: Context added

**Step 3: Generate initial embeddings**

Run: `qmd embed`
Expected: Embeddings generated (may download models on first run)

**Step 4: Verify the collection works**

Run: `qmd search "dashboard" -c steven`
Expected: Results showing the dashboard file

**Step 5: Commit**

No files in the repo to commit — QMD configuration is system-level.

---

### Task 4: Create the SKILL.md

**Files:**
- Create: `claude/skills/steven/SKILL.md`

**Step 1: Create the skill directory**

Run: `mkdir -p claude/skills/steven/references`

**Step 2: Write `SKILL.md`**

Write `claude/skills/steven/SKILL.md`:

```markdown
---
name: steven
description: Use when Avery wants to interact with Steven, the persistent work assistant — saving knowledge, searching memory, writing daily notes, checking priorities, or refreshing external data
---

# Steven

Persistent work assistant backed by an Obsidian vault and QMD semantic search.

## Startup

On every invocation, read these files for orientation:

1. `~/steven-vault/system/identity.md` — who Steven is and how to operate
2. `~/steven-vault/system/dashboard.md` — what Avery is currently focused on

## Vault

All knowledge lives at `~/steven-vault/`. Three directories:

- `system/` — identity, rules, dashboard (Steven's operating files)
- `daily/` — daily notes (`YYYY-MM-DD.md`)
- `knowledge/` — flat tagged markdown files (everything else)

## Intent Routing

Determine the intent from Avery's message and load the appropriate reference:

- **Saving knowledge** — Avery wants to remember a decision, learning, fact, or
  note for later. Load `references/remember.md`.
- **Searching memory** — Avery wants to find or recall something — past
  decisions, context on a topic, what's known about something. Load
  `references/search.md`.
- **Daily notes** — Avery wants to write a session digest, read what happened on
  a given day, or review recent activity. Load `references/daily-notes.md`.
- **Dashboard and priorities** — Avery asks about current state, what's active,
  to-dos, or wants to update focus areas. Load `references/dashboard.md`.
- **Refreshing external data** — Avery wants to pull from Jira, Confluence, or
  other sources into the vault. Load `references/ingest.md`.

If the intent is ambiguous, ask Avery to clarify.

## Tagging Convention

Every knowledge file in the vault gets YAML frontmatter:

~~~yaml
---
source: jira | confluence | gmail | calendar | manual
type: decision | meeting | ticket | page | learning | note | event
project: project-name (optional)
tags: [topic1, topic2]
date: YYYY-MM-DD
---
~~~
```

**Step 3: Verify the skill file is well-formed**

Run: `head -3 claude/skills/steven/SKILL.md`
Expected: YAML frontmatter starting with `---`

**Step 4: Commit**

```bash
git add claude/skills/steven/SKILL.md
git commit -m "feat(steven): add SKILL.md with identity and intent routing"
```

---

### Task 5: Create `references/remember.md`

**Files:**
- Create: `claude/skills/steven/references/remember.md`

**Step 1: Write the reference file**

Write `claude/skills/steven/references/remember.md`:

```markdown
# Saving Knowledge

How to save information to the vault.

## Workflow

1. **Check for duplicates first** — search QMD before creating a new file:
   ```bash
   qmd search "topic keywords" -c steven --files
   ```
   If a related file exists, update it instead of creating a new one.

2. **Create the file** — write a new markdown file in `~/steven-vault/knowledge/`
   with a descriptive kebab-case filename:
   - `auth-service-chose-jwt-over-opaque-tokens.md`
   - `deploy-process-requires-staging-approval.md`
   - `api-rate-limits-set-to-1000-per-minute.md`

3. **Add frontmatter** — use the tagging convention from SKILL.md. Set
   `source: manual` for knowledge captured from conversation.

4. **Write concise content** — capture the substance: what was decided and why,
   what the fact is, what was learned. Not verbatim conversation.

5. **Re-embed** — after writing new files:
   ```bash
   qmd embed
   ```

## What to Save

- Decisions and their rationale
- Facts and constraints discovered during work
- Learnings from debugging or investigation
- Meeting outcomes and action items
- Architectural patterns and conventions

## What Not to Save

- Transient status updates ("I'm working on X")
- Raw conversation transcripts
- Speculative conclusions from a single data point
- Credentials, tokens, or sensitive configuration

## Corrections

When Avery corrects something already stored, find and update the existing
file rather than creating a new one. Use QMD search to locate the file,
read it, and edit in place.
```

**Step 2: Commit**

```bash
git add claude/skills/steven/references/remember.md
git commit -m "feat(steven): add remember reference for saving knowledge"
```

---

### Task 6: Create `references/search.md`

**Files:**
- Create: `claude/skills/steven/references/search.md`

**Step 1: Write the reference file**

Write `claude/skills/steven/references/search.md`:

```markdown
# Searching Memory

How to search the vault via QMD CLI.

## Search Modes

All searches scoped to the `steven` collection with `-c steven`.

### Keyword Search (fast, start here)

```bash
qmd search "exact terms" -c steven
```

BM25 full-text search. Good for specific terms, names, ticket keys, exact
phrases. Start with this for simple lookups.

### Semantic Search (conceptual)

```bash
qmd vsearch "natural language question" -c steven
```

Vector similarity search. Good for questions like "what did we decide about
authentication?" where the exact words may not appear in the stored files.

### Hybrid Search (best quality, slowest)

```bash
qmd query "question" -c steven
```

Combines keyword search, vector search, query expansion, and LLM re-ranking.
Use for important queries when keyword and semantic search don't find what's
needed.

## Useful Flags

- `-n <num>` — number of results (default: 5)
- `--files` — output as file list with scores
- `--full` — show full document content
- `--min-score <num>` — minimum relevance threshold

## Workflow

1. Start with `qmd search` for simple lookups
2. If results are poor, try `qmd vsearch` for semantic matching
3. For critical queries, use `qmd query` for best results
4. After getting search results, read the full files for complete context
5. Present findings conversationally — don't dump raw search output

## No Results

If nothing is found:
- Try different keywords or rephrase the query
- Broaden the search (remove specific terms)
- Check if the knowledge was ever saved — it may not be in the vault yet
- Say so honestly rather than guessing
```

**Step 2: Commit**

```bash
git add claude/skills/steven/references/search.md
git commit -m "feat(steven): add search reference for QMD queries"
```

---

### Task 7: Create `references/daily-notes.md`

**Files:**
- Create: `claude/skills/steven/references/daily-notes.md`

**Step 1: Write the reference file**

Write `claude/skills/steven/references/daily-notes.md`:

```markdown
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
```

**Step 2: Commit**

```bash
git add claude/skills/steven/references/daily-notes.md
git commit -m "feat(steven): add daily-notes reference for session digests"
```

---

### Task 8: Create `references/dashboard.md`

**Files:**
- Create: `claude/skills/steven/references/dashboard.md`

**Step 1: Write the reference file**

Write `claude/skills/steven/references/dashboard.md`:

```markdown
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
```

**Step 2: Commit**

```bash
git add claude/skills/steven/references/dashboard.md
git commit -m "feat(steven): add dashboard reference for active state"
```

---

### Task 9: Create `references/ingest.md`

**Files:**
- Create: `claude/skills/steven/references/ingest.md`

**Step 1: Write the reference file**

Write `claude/skills/steven/references/ingest.md`:

```markdown
# Ingesting External Data

How to pull data from external sources into the vault. This workflow is
source-agnostic — the same rules apply regardless of where the data comes from.

## Workflow

1. **Search before creating** — use QMD to check if knowledge about this
   topic/ticket/page already exists:
   ```bash
   qmd search "identifier or topic" -c steven --files
   ```

2. **Update over duplicate** — if a match exists, read the existing file and
   update it with new information rather than creating a new one.

3. **Summarize, don't dump** — write concise markdown summaries, not raw API
   responses or full page contents. Focus on status, decisions, and action items.

4. **Tag consistently** — apply the frontmatter tagging convention from SKILL.md.

5. **Preserve provenance** — include source identifiers in frontmatter so future
   runs can find and update the file:
   - Jira: ticket key in `tags` and filename (e.g., `jira-ABC-123-auth-redesign.md`)
   - Confluence: page ID in `tags`

6. **Re-embed once** — after all writes are complete:
   ```bash
   qmd embed
   ```

7. **Update the dashboard** — if ingested data affects active projects, in-flight
   work, or to-dos, update `system/dashboard.md`.

## Data Sources

### Jira (via Atlassian MCP)

- Fetch active tickets using `searchJiraIssuesUsingJql`
- For each ticket: summary, status, assignee, priority, recent comments
- Frontmatter: `source: jira`, `type: ticket`, ticket key in `tags`
- Filename pattern: `jira-<KEY>-<short-description>.md`

### Confluence (via Atlassian MCP)

- Fetch recently updated pages using `searchConfluenceUsingCql`
- Summarize page content to key points and decisions
- Frontmatter: `source: confluence`, `type: page`, page ID in `tags`
- Filename pattern: `confluence-<short-title>.md`

### Gmail and Google Calendar

Integration deferred to a future iteration. When MCPs or API access become
available, the same workflow applies — search before creating, summarize,
tag, and re-embed.

## Cron Integration

Ingestion is triggered via cron entries that run Claude Code headlessly:

```bash
# Example cron entries (managed by Avery, not by Steven)
0 */2 * * * claude -p "/steven refresh current sprint tickets in Jira"
0 8 * * * claude -p "/steven check Confluence for pages updated in the last 24 hours"
```

Each invocation should be scoped to complete within a single Claude Code session.
```

**Step 2: Commit**

```bash
git add claude/skills/steven/references/ingest.md
git commit -m "feat(steven): add ingest reference for external data"
```

---

### Task 10: Register the Skill and Update Documentation

**Files:**
- Modify: `claude/settings.json` — add `Skill(steven)` and QMD bash permissions
- Modify: `CLAUDE.md` — add steven to skills table

**Step 1: Add skill permission and QMD commands to `settings.json`**

In `claude/settings.json`, add these entries to the `permissions.allow` array:

- `"Skill(steven)"` — after the other `Skill(...)` entries
- `"Bash(qmd:*)"` — after the other `Bash(...)` entries

**Step 2: Add steven to the Integrations table in `CLAUDE.md`**

Add a new row to the Integrations table:

```markdown
| `steven`                 | Persistent work assistant with long-term memory    |
```

**Step 3: Commit**

```bash
git add claude/settings.json CLAUDE.md
git commit -m "feat(steven): register skill and update docs"
```

---

### Task 11: Smoke Test the Skill

**Files:**
- None (manual verification)

**Step 1: Apply changes via stow**

Run: `./setup.sh`
Expected: Stow symlinks updated without errors

**Step 2: Verify skill is loadable**

Run: `ls -la ~/.claude/skills/steven/`
Expected: Symlinked directory containing SKILL.md and references/

**Step 3: Verify QMD can search the vault**

Run: `qmd search "operating style" -c steven`
Expected: Results pointing to `system/identity.md`

**Step 4: Verify vault files are readable**

Run: `head -5 ~/steven-vault/system/identity.md`
Expected: YAML frontmatter with `source: manual`

**Step 5: Commit**

No files to commit — verification only.
