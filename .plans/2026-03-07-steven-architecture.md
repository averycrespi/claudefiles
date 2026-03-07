# Steven — Personal Work Assistant Architecture

## Context

Today, Claude Code sessions are stateless across projects. CLAUDE.md provides
procedural instructions and the auto-memory directory provides limited persistence,
but there is no unified long-term memory, no cross-session knowledge retrieval,
and no way to aggregate context from external work tools (Jira, Confluence,
Gmail, Calendar) into a searchable substrate.

The goal is to build a persistent work assistant — named Steven — that is
accessible from any Claude Code session via a single skill, backed by an
Obsidian vault and QMD semantic search.

Inspiration comes from community experiments (the "Vox" system and similar
setups) that use Obsidian as a long-term memory layer for Claude Code, but
Steven differs in key ways: it's skill-based (portable across projects),
work-focused (no personal data), and designed around scheduled ingestion from
multiple external sources.

## Goals & Non-Goals

**Goals:**
- Persistent work memory accessible from any Claude Code session
- Semantic search over all stored knowledge via QMD
- Scheduled ingestion from Jira, Confluence, Gmail, Google Calendar
- Daily notes with session digests for temporal context
- Active state dashboard showing current priorities and in-flight work
- Light identity (name, operating style) for consistency across sessions

**Non-Goals:**
- Personal life data — Steven is work-only
- Full autonomous agent — Steven responds to invocations, not self-initiating
- Real-time sync — external sources refresh on a schedule, not live
- Obsidian UI features — no reliance on plugins, graph view, or Obsidian-specific
  functionality; the vault is just a directory of markdown files
- Home automation or device control
- Web UI — a web view of the knowledge base and dashboard is a future
  possibility but out of scope for v1

## System Overview

Steven is a persistent work assistant implemented as a single Claude Code skill
(`/steven`) backed by a dedicated Obsidian vault and QMD semantic search.

Unlike a standalone agent that lives in one project, Steven is accessible from
any Claude Code session. You can be deep in a codebase and ask Steven to
remember a decision, pull context from last week's meetings, or surface what's
active on a project.

The vault serves as Steven's long-term memory. It stores knowledge from multiple
sources — your own notes and learnings, Jira tickets, Confluence pages, calendar
events, email threads — all as flat tagged markdown files searchable via QMD.

Scheduled cron jobs run Claude Code headlessly to refresh external data. The
same `/steven` skill handles both interactive use ("what do I know about project
X?") and scheduled use (`claude -p "use /steven to refresh Jira context"`).

Steven has a light identity: a name, an operating style, and knowledge of who
Avery is. Not a character — a consistent colleague with defined habits around
summarization, what it surfaces proactively, and how it organizes what it learns.

## Components

### The `/steven` Skill

**Responsibility:** Single entry point for all interactions with the assistant.
Handles intent routing — determines whether the user wants to save, recall,
search, reflect, or trigger an ingestion refresh. Reads and writes to the vault.

**Interface:** Invoked as `/steven` from any Claude Code session, or
programmatically via `claude -p` for scheduled tasks. Accepts natural language
— no subcommands or rigid syntax.

**Dependencies:** QMD (for search), Obsidian vault (for storage), existing
MCPs and skills (Atlassian, etc.) for external data access.

### Obsidian Vault

**Responsibility:** Durable, human-readable storage for all of Steven's
knowledge. Every piece of information is a markdown file with YAML frontmatter
tags.

**Structure:**
```
steven-vault/
├── system/              # Steven's operating files
│   ├── identity.md      # Name, operating style, who Avery is
│   ├── rules.md         # Behavioral rules, preferences, priorities
│   └── dashboard.md     # Active projects, current focus, in-flight work
├── daily/               # Daily notes
│   └── YYYY-MM-DD.md    # Session digests, what happened, what was decided
└── knowledge/           # Everything else — flat, tagged, searchable
    └── *.md
```

**Tagging convention:** Every knowledge file gets frontmatter:
```yaml
---
source: jira | confluence | gmail | calendar | manual
type: decision | meeting | ticket | page | learning | note | event
project: project-name (optional)
tags: [topic1, topic2]
date: YYYY-MM-DD
---
```

The vault is organized for search, not for browsing. QMD handles retrieval;
the folder structure is minimal.

**Interface:** Filesystem. Files are read and written by the `/steven` skill
and indexed by QMD.

**Dependencies:** None — it's just a directory of markdown files.

### QMD Search Layer

**Responsibility:** Semantic and hybrid search over the vault. Enables natural
language queries like "what did we decide about authentication?" rather than
requiring exact keyword matches.

**Interface:** CLI (`qmd search`, `qmd vsearch`, `qmd query`) invoked from
the `/steven` skill via bash. Alternatively, QMD's MCP server for tighter
integration.

**Dependencies:** The Obsidian vault as a QMD collection. Requires periodic
`qmd embed` to keep the index fresh after new files are written.

### Ingestion Layer

**Responsibility:** Pulls data from external sources into the vault on a
schedule. Each source has its own ingestion logic that reads from the source,
summarizes/structures the data, and writes tagged markdown files.

**Sources (initial):**
- **Jira** — active tickets, recent updates, sprint state (via Atlassian MCP)
- **Confluence** — relevant pages, meeting notes (via Atlassian MCP)
- **Gmail** — important threads, action items (integration TBD)
- **Google Calendar** — upcoming events, meeting context (integration TBD)

**Interface:** Cron jobs that run Claude Code headlessly:
```bash
# Example: refresh Jira context every 2 hours
0 */2 * * * claude -p "/steven refresh jira context"
```

**Dependencies:** External MCPs and APIs for each source. The `/steven` skill
for orchestration. QMD re-embedding after ingestion.

### System Files

**Responsibility:** Steven's self-knowledge — who it is, how it operates, and
what's currently active.

**Components:**
- `identity.md` — Steven's name, operating style, knowledge of Avery (role,
  preferences, communication style). Light and professional.
- `rules.md` — Behavioral rules: how to summarize, when to surface
  contradictions, what to prioritize, memory hygiene rules (don't save
  speculative conclusions, fix facts at the source when corrected).
- `dashboard.md` — Living document of active projects, current priorities,
  in-flight work. Updated by Steven during sessions and ingestion.

**Interface:** Read by the `/steven` skill at the start of interactions.
Written to by Steven when rules or state change.

**Dependencies:** None.

## Decisions

### Single skill vs. multiple skills
**Chosen:** Single `/steven` skill.
**Alternatives:** Multiple focused skills (`/remember`, `/recall`, `/reflect`)
or many fine-grained skills.
**Reasoning:** One skill is simpler to maintain and evolve. Intent routing from
natural language is something Claude handles well. Multiple skills fragment the
interface and create confusion about which to use when.

### Flat + tags vs. folder hierarchy
**Chosen:** Flat tagged markdown with minimal folder skeleton.
**Alternatives:** Predefined deep folder structure, or emergent structure.
**Reasoning:** Multiple data sources create a classification problem with deep
hierarchies — does a Jira ticket about an architecture decision go in
`sources/jira/`, `decisions/`, or `projects/foo/`? Flat + tags avoids this.
QMD handles retrieval semantically regardless of file location. Minimal folders
(`system/`, `daily/`) exist only for operational clarity.

### Light identity vs. full persona vs. no identity
**Chosen:** Light identity — a name (Steven), operating style, knowledge of
the user (Avery).
**Alternatives:** Full persona with personality traits, or no identity at all.
**Reasoning:** This is a work tool. A full persona adds complexity without
value in a professional context. But a name and consistent operating style
creates continuity across sessions and makes the interaction feel less
transactional.

### Cron + Claude Code for ingestion vs. plain scripts
**Chosen:** Cron running Claude Code headlessly with the `/steven` skill.
**Alternatives:** Shell/Python scripts that call APIs directly.
**Reasoning:** Claude Code already has MCP access to Atlassian and can be
extended to other sources. Using the same skill for ingestion means the
summarization, tagging, and filing logic is consistent whether data comes
from a scheduled job or an interactive session. More expensive in tokens
but more intelligent.

### QMD vs. grep/glob vs. other search
**Chosen:** QMD for semantic/hybrid search.
**Alternatives:** grep/glob (what most Claude Code setups use today),
Spotlight/mdfind, or a custom vector store.
**Reasoning:** As the vault grows with ingested data from multiple sources,
keyword search becomes insufficient. "What do we know about rate limiting?"
needs to find documents that discuss throttling, API limits, and quota
management — not just documents containing the exact phrase. QMD runs locally,
indexes markdown well, and has both CLI and MCP interfaces.

## Constraints & Limitations

- **Token cost:** Each cron invocation consumes tokens. Ingestion frequency
  must balance freshness against cost. The Reddit community flags token
  economy as the key bottleneck.
- **QMD re-embedding:** After writing new files, `qmd embed` must run to
  update the search index. This adds latency to the ingestion pipeline and
  needs to be part of the workflow.
- **Gmail and Calendar integration:** No existing MCP or skill for these yet.
  These integrations need to be built or sourced. Architecture assumes they
  will exist but doesn't depend on them for v1.
- **Headless Claude Code:** Cron-based invocation via `claude -p` works but
  has limitations around session length, approval prompts, and error handling.
  Scheduled tasks need to be designed to complete within a single invocation.
- **Memory hygiene:** The contradiction tracking and stale memory problems
  identified in the Reddit post apply here too. Rules in `rules.md` can
  mitigate but not fully solve this — it's an ongoing challenge.
- **Vault size:** As ingested data grows, both QMD indexing time and the
  risk of stale/duplicate content increase. Will need a strategy for
  archival or expiry of old ingested data.
