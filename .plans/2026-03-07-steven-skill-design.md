# Steven Skill Design

## Purpose

A single Claude Code skill (`/steven`) that provides persistent work memory
accessible from any session. Steven is backed by an Obsidian vault at
`~/steven-vault` and uses QMD for semantic search.

See `.plans/2026-03-07-steven-architecture.md` for the full system architecture.

## Skill File Layout

```
claude/skills/steven/
├── SKILL.md                    # Identity, vault path, intent routing
└── references/
    ├── remember.md             # Saving knowledge to the vault
    ├── search.md               # Searching via QMD CLI
    ├── daily-notes.md          # Writing/reading daily notes + to-dos
    ├── dashboard.md            # Active state, priorities, to-dos
    └── ingest.md               # Pulling from external sources
```

## SKILL.md Structure

The skill file stays lean to minimize context usage when invoked from
sessions already deep in other work.

**Contents:**

1. **Frontmatter** — name (`steven`), description, trigger conditions
2. **Identity** — who Steven is, who Avery is, operating style (~100 words
   inline, with a note to read `system/identity.md` for full context)
3. **Vault path** — hardcoded `~/steven-vault`
4. **Startup behavior** — on every invocation, read `system/identity.md` and
   `system/dashboard.md` to orient on current state
5. **Intent routing** — descriptive guidance (not keyword matching) that
   explains each intent category and which reference file to load:
   - When Avery wants to save or remember something — a decision, a learning,
     a fact, something to note for later — load `references/remember.md`
   - When Avery wants to find or recall something — asking what's known about
     a topic, looking for past decisions, searching for context — load
     `references/search.md`
   - When Avery wants to write or read daily notes — session digests, what
     happened on a given day, journal-style entries — load
     `references/daily-notes.md`
   - When Avery asks about current state, priorities, or to-dos — what's
     active, what needs attention, updating focus areas — load
     `references/dashboard.md`
   - When Avery wants to refresh external data — pulling from Jira,
     Confluence, or other sources — load `references/ingest.md`
6. **Tagging convention** — the frontmatter schema for knowledge files, since
   it's needed across multiple workflows:
   ```yaml
   ---
   source: jira | confluence | gmail | calendar | manual
   type: decision | meeting | ticket | page | learning | note | event
   project: project-name (optional)
   tags: [topic1, topic2]
   date: YYYY-MM-DD
   ---
   ```

## Reference Files

### references/remember.md

How to save knowledge to the vault.

- Create a new markdown file in `knowledge/` with a descriptive filename
  (kebab-case, e.g. `auth-service-chose-jwt-over-opaque-tokens.md`)
- Generate appropriate frontmatter using the tagging convention
- Write the content as concise markdown — capture the substance, not
  verbatim conversation
- Guidance on what's worth saving vs. what's too ephemeral (decisions,
  facts, and learnings are worth saving; transient status updates are not)
- When the knowledge is a correction or update to something already stored,
  update the existing file rather than creating a duplicate — use QMD to
  check if related knowledge already exists before creating new files
- Run `qmd embed` after writing new files to keep the search index current

### references/search.md

How to search the vault via QMD CLI.

- All searches scoped to the `steven` collection (`-c steven`)
- Three search modes:
  - `qmd search "query" -c steven` — fast BM25 keyword search, good for
    specific terms and exact phrases
  - `qmd vsearch "query" -c steven` — semantic vector search, good for
    natural language questions and conceptual queries
  - `qmd query "query" -c steven` — hybrid search with query expansion and
    LLM reranking, best quality but slowest; use for important queries
- Start with `qmd search` for simple lookups, escalate to `qmd query` when
  keyword search doesn't find what's needed
- After getting search results, read the full files QMD points to for
  complete context
- Present findings conversationally — don't dump raw search output

### references/daily-notes.md

How to write and read daily notes.

- Daily notes live at `daily/YYYY-MM-DD.md`
- Each session digest is appended to the day's note (not overwritten),
  with a timestamp header
- Session digest format:
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
- If a daily note for today doesn't exist yet, create it with a date header
- When to-dos are captured, also add them to `system/dashboard.md`
- For temporal queries ("what happened last Tuesday?"), find the
  corresponding daily note and summarize it
- Run `qmd embed` after writing new daily notes

### references/dashboard.md

How to read and update the active state dashboard.

- The dashboard lives at `system/dashboard.md`
- Format:
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
- Update the `updated` date whenever the dashboard is modified
- When answering "what am I working on?" style questions, read the
  dashboard and present it conversationally
- When Avery mentions completing a to-do, check it off on the dashboard
- When new to-dos come from daily notes or conversation, add them to
  the dashboard
- Periodically prune completed items and stale entries

### references/ingest.md

How to pull data from external sources into the vault.

- **Jira** (via Atlassian MCP):
  - Fetch active tickets assigned to Avery or in watched projects
  - For each ticket, check if a file already exists in `knowledge/`
    (search by Jira key in filename or frontmatter)
  - Create or update a knowledge file with: summary, status, assignee,
    priority, recent comments, linked issues
  - Frontmatter: `source: jira`, `type: ticket`, include Jira key in tags
- **Confluence** (via Atlassian MCP):
  - Fetch recently updated pages in relevant spaces
  - Summarize page content into a knowledge file
  - Frontmatter: `source: confluence`, `type: page`
- **Gmail and Calendar**: integration TBD, document as placeholder
- After ingestion, run `qmd embed` to update the search index
- Deduplication: always check for existing files before creating new ones;
  prefer updating existing files when the source content has changed
- Designed to complete within a single Claude Code invocation for
  headless cron use

## Vault Structure (Created Separately)

```
~/steven-vault/
├── system/
│   ├── identity.md             # Steven's name, operating style, who Avery is
│   ├── rules.md                # Behavioral guardrails, memory hygiene
│   └── dashboard.md            # Active state, priorities, to-dos
├── daily/
│   └── YYYY-MM-DD.md           # Session digests
└── knowledge/
    └── *.md                    # Flat tagged knowledge files
```

### system/identity.md

Steven's self-knowledge:
- Name: Steven
- User: Avery
- Operating style: concise, professional, proactively connects dots across
  knowledge, surfaces contradictions when noticed, asks rather than assumes
- Read on every invocation for orientation

### system/rules.md

Behavioral guardrails:
- Don't save speculative conclusions from a single data point
- Fix facts at the source when corrected (update existing files, don't
  just add a new contradicting one)
- Prefer updating existing files over creating duplicates
- Don't store credentials, personal data, or raw dumps without
  summarization
- Tagging standards: always include source, type, date; project and tags
  as applicable
- Summarization: concise and decision-focused

### system/dashboard.md

Starts with the section skeleton (Current Focus, Active Projects,
In-Flight Work, To-Dos, Recent Decisions), mostly empty, populated
as Steven is used.

## QMD Setup

One-time setup to register the vault as a QMD collection:

```bash
qmd collection add ~/steven-vault --name steven
qmd context add qmd://steven "Work knowledge base — decisions, meetings, tickets, learnings, daily notes, and project context"
qmd embed
```

Re-embedding runs after any workflow that writes new files (remember,
daily notes, ingest).

## Key Design Decisions

### Natural language intent routing, not subcommands
The skill describes intents descriptively and lets Claude determine which
workflow applies. No keyword matching or rigid syntax. If the intent is
ambiguous, Steven asks for clarification.

### Thin SKILL.md + reference files
SKILL.md contains only identity, vault path, and intent routing (~500
words). Detailed workflow instructions live in five reference files loaded
on demand. This keeps context lean when invoked from sessions already
working on other things.

### QMD via CLI
Steven invokes QMD through Bash (`qmd search`, `qmd vsearch`,
`qmd query`) rather than an MCP server. Simpler setup, consistent with
how other skills call external tools, no running server process needed.

### To-dos in daily notes + dashboard
To-dos originate in daily notes where they're captured during sessions.
They're also added to the dashboard for a single view of all open items.
Completion is tracked in both places.

### Read identity + dashboard on every invocation
Every time `/steven` is triggered, it reads `system/identity.md` and
`system/dashboard.md`. This gives Steven orientation on who it is and
what Avery is currently focused on, without loading the full knowledge
base into context.
