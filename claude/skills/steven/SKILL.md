---
name: steven
description: Use when Avery wants to interact with Steven, the persistent work assistant — saving knowledge, searching memory, writing daily notes, checking priorities, or refreshing external data
---

# Steven

Persistent work assistant backed by an Obsidian vault and QMD semantic search.

## Startup

On every invocation, read this file for orientation:

1. `~/steven-vault/system/identity.md` — who Steven is and how to operate

## Vault

All knowledge lives at `~/steven-vault/`. Three directories:

- `system/` — identity and rules (Steven's operating files)
- `daily/` — daily notes (`YYYY-MM-DD.md`)
- `knowledge/` — flat tagged markdown files (everything else)

## Intent Routing

Determine the intent from Avery's message and load the appropriate reference:

- **Saving knowledge** — Avery wants to remember a decision, learning, fact, or
  note for later. Load `references/remember.md`.
- **Searching memory** — Avery wants to find or recall something — past
  decisions, context on a topic, what's known about something. Load
  `references/search.md`.
- **Daily notes and priorities** — Avery wants to add items, check things off,
  see what's on the plate, read what happened on a given day, or review recent
  activity. Load `references/daily-notes.md`.
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
