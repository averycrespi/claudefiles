# Steven

Persistent work assistant backed by an [Obsidian](https://obsidian.md/) vault and [QMD](https://github.com/qmd-project/qmd) semantic search. Steven provides long-term memory across Claude Code sessions — saving decisions, meeting notes, ticket summaries, and daily digests so context is never lost.

## Vault

All knowledge lives at `~/steven-vault/`. The vault has three directories:

```
~/steven-vault/
├── system/       # Identity and rules (Steven's operating files)
├── daily/        # Daily notes (YYYY-MM-DD.md)
└── knowledge/    # Flat tagged markdown files (everything else)
```

Every knowledge file uses YAML frontmatter for tagging:

```yaml
---
source: jira | confluence | manual
type: decision | meeting | ticket | page | learning | note
project: project-name  # optional
tags: [topic1, topic2]
date: YYYY-MM-DD
---
```

## The `/steven` Skill

Invoke Steven from any Claude Code session with `/steven`:

```
/steven remember that we decided to use PostgreSQL for the new service
/steven what do we know about the auth redesign?
/steven write a session digest for today
/steven what's on my plate?
/steven refresh current sprint tickets from Jira
```

The skill routes your intent to the appropriate workflow (remember, search, daily notes, or ingest) and reads the vault for context before responding.

Skill definition: `claude/skills/steven/SKILL.md`

## Cron Ingestion

Steven can run headlessly via cron to pull external data (Jira tickets, Confluence pages) into the vault on a schedule.

### How It Works

The wrapper script `steven/scripts/ingest.sh` handles the cron environment:

1. Sets up `PATH` so cron can find the `claude` CLI
2. Logs all output to `~/steven-vault/logs/` with a timestamped filename
3. Propagates the exit code

Usage:

```bash
./steven/scripts/ingest.sh "/steven refresh current sprint tickets from Jira"
```

### Example Cron Entries

```crontab
# Refresh Jira tickets every 2 hours during work hours
0 */2 * * 1-5  /path/to/steven/scripts/ingest.sh "/steven refresh current sprint tickets from Jira"

# Check Confluence daily at 8am
0 8 * * 1-5    /path/to/steven/scripts/ingest.sh "/steven check Confluence for pages updated in the last 24 hours"

# Clean up old logs weekly on Sunday
0 0 * * 0      /path/to/steven/scripts/log-rotate.sh
```

Replace `/path/to/` with the absolute path to this repository.

### Logs

Ingestion logs are written to `~/steven-vault/logs/` with the format `YYYY-MM-DD_HH-MM-SS.log`. Each log includes the prompt, full Claude output, and exit code.

### Log Rotation

The `steven/scripts/log-rotate.sh` script deletes logs older than 14 days. Schedule it via cron (see example above) or run manually.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system components, design decisions, and constraints.
