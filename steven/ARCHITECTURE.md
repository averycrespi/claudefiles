# Steven Architecture

Steven is a single Claude Code skill backed by four components:

```
┌─────────────────────────────────────────────────────┐
│  /steven skill                                      │
│  Intent routing · Identity · Tagging conventions    │
├──────────┬──────────┬───────────────┬───────────────┤
│  Vault   │  QMD     │  Ingestion    │  System Files │
│  ~/      │  Search  │  Layer        │  identity.md  │
│  steven- │  Layer   │  (cron +      │  rules.md     │
│  vault/  │          │  claude -p)   │               │
└──────────┴──────────┴───────────────┴───────────────┘
```

## Components

**The `/steven` skill** — Single entry point for all interactions. Handles intent routing via natural language — determines whether the user wants to save, recall, search, write daily notes, or trigger ingestion. Defined at `claude/skills/steven/SKILL.md` with four reference files for detailed workflows.

**Obsidian vault** — Durable, human-readable storage at `~/steven-vault/`. Every piece of knowledge is a markdown file with YAML frontmatter tags. Organized for search (via QMD), not for browsing — the folder structure is intentionally minimal.

**QMD search layer** — Semantic and hybrid search over the vault. Supports keyword search (`qmd search`), vector similarity (`qmd vsearch`), and hybrid with LLM re-ranking (`qmd query`). Requires periodic `qmd embed` to keep the index fresh after writes.

**Ingestion layer** — Cron jobs that run `claude -p` headlessly to pull data from external sources. The same `/steven` skill handles both interactive and scheduled use, so summarization, tagging, and deduplication logic stays consistent. See the [README](./README.md#cron-ingestion) for operational details.

**System files** — Steven's self-knowledge: `identity.md` (name, operating style) and `rules.md` (behavioral guardrails, memory hygiene). Read on every invocation for orientation. Active items and priorities live in daily notes.

## Key Design Decisions

- **Single skill, not multiple** — One `/steven` skill with natural language intent routing, rather than separate `/remember`, `/recall`, `/reflect` skills. Simpler to maintain, and Claude handles intent disambiguation well.
- **Flat files + tags, not folder hierarchy** — Multiple data sources create a classification problem with deep hierarchies. Flat tagged markdown with QMD for retrieval avoids "does this go in `sources/jira/` or `decisions/`?" entirely.
- **Cron + Claude Code for ingestion, not plain scripts** — Using Claude Code headlessly for ingestion means the same summarization and tagging logic applies to both interactive and scheduled use. More expensive in tokens, but more intelligent.
- **QMD for search, not grep** — As the vault grows, keyword search becomes insufficient. "What do we know about rate limiting?" needs to find documents about throttling, API limits, and quotas — not just exact phrase matches.
- **Light identity, not full persona** — A name and consistent operating style creates continuity across sessions without the complexity of a full character. Steven is a colleague, not a character.

## Constraints

- **Token cost** — Each cron invocation consumes tokens. Ingestion frequency balances freshness against cost.
- **QMD re-embedding** — After writing new files, `qmd embed` must run to update the search index.
- **Gmail and Calendar** — Deferred to a future iteration when MCPs or API integrations are available.
- **Memory hygiene** — Contradiction tracking and stale memory are ongoing challenges, mitigated by rules in `rules.md`.
