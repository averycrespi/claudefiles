# Steven Ingestion System Design

## Purpose

Define how Steven pulls data from external sources into the vault on a
schedule. The ingestion system is intentionally simple — cron entries are
natural language prompts, and Steven uses existing MCPs and skills to
access the data. The skill itself only needs to know how to integrate
data into the vault cleanly.

See `.plans/2026-03-07-steven-architecture.md` for the full system
architecture and `.plans/2026-03-07-steven-skill-design.md` for the
skill design.

## How It Works

### Cron Entries

Each scheduled job is a `claude -p` invocation with a natural language
prompt that tells Steven what to look at. The prompts specify the source,
scope, and data to include. No ingestion logic is hardcoded in the skill.

Entries are added to the regular system crontab with a `# steven` marker
comment for easy identification.

Example entries:

```crontab
# steven — refresh current sprint tickets
0 */2 * * * claude -p "/steven refresh your knowledge of current sprint tickets in Jira"

# steven — sync recent Confluence updates
0 8 * * * claude -p "/steven check Confluence for pages updated in the last 24 hours and save anything new"

# steven — morning briefing prep
30 7 * * 1-5 claude -p "/steven update your dashboard with today's priorities based on what you know"
```

New cron entries are written by Avery in natural language. Steven can
suggest entries but doesn't modify the crontab directly.

### Knowledge Integration (references/ingest.md)

The ingest reference file is source-agnostic. It teaches Steven how to
take any data — regardless of where it came from — and merge it into
the vault properly. This is the "how" of ingestion, while the cron
prompt is the "what."

**Workflow:**

1. **Search before creating** — use QMD to check if knowledge about this
   topic/ticket/page already exists in the vault
2. **Update over duplicate** — if a match exists, update the existing
   file with new information rather than creating a new one
3. **Summarize, don't dump** — write concise markdown summaries, not raw
   API responses or full page contents
4. **Tag consistently** — apply the frontmatter tagging convention
   (source, type, project, tags, date) to every file
5. **Preserve provenance** — include source identifiers (Jira key,
   Confluence page ID, etc.) in frontmatter so future runs can find
   and update the file
6. **Re-embed once** — after all writes are complete, run `qmd embed`
   once to update the search index
7. **Update the dashboard** — if ingested data affects active projects,
   in-flight work, or to-dos, update `system/dashboard.md`

### Data Sources (v1)

**Jira** (via Atlassian MCP):
- Ticket summaries, status, assignee, priority
- Recent comments and updates
- Linked issues
- Sprint state
- Provenance: Jira ticket key in frontmatter tags and filename

**Confluence** (via Atlassian MCP):
- Page content summarized to key points
- Recently updated pages in relevant spaces
- Provenance: Confluence page ID in frontmatter

**Gmail and Google Calendar**: deferred to a future iteration when
MCPs or API integrations are available.

### Adding New Sources

When a new MCP or API integration becomes available, no changes to
the skill are needed. Avery adds a new cron entry with a natural
language prompt describing what to pull, and Steven uses the ingest
workflow to integrate the data. The `references/ingest.md` rules
apply regardless of source.

## Key Design Decisions

### Natural language cron prompts, not source-specific logic
The cron entry describes what to do in plain English. Steven uses
whatever MCPs and skills are available to fulfill the request. This
means adding a new source is just adding a cron entry — no skill
changes required.

### Source-agnostic integration rules
The `references/ingest.md` file teaches knowledge integration hygiene,
not source-specific extraction. The same deduplication, summarization,
and tagging rules apply to all sources.

### Regular crontab with marker comments
Steven's cron entries live in the normal system crontab, marked with
`# steven` comments for identification. Simple, no extra infrastructure.
A dedicated crontab or launchd approach can be revisited later if needed.

### Designed for single-invocation completion
Each cron job is scoped to complete within a single Claude Code
invocation. This means prompts should be focused ("current sprint
tickets in Jira") rather than open-ended ("refresh everything").
