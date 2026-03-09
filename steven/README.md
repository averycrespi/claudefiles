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

## The `/asking-steven` Skill

Invoke Steven from any Claude Code session with `/asking-steven`:

```
/asking-steven remember that we decided to use PostgreSQL for the new service
/asking-steven what do we know about the auth redesign?
/asking-steven write a session digest for today
/asking-steven what's on my plate?
/asking-steven refresh current sprint tickets from Jira
```

The skill routes your intent to the appropriate workflow (remember, search, daily notes, or ingest) and reads the vault for context before responding.

Skill definition: `claude/skills/asking-steven/SKILL.md`

## Scheduled Ingestion

Steven can run headlessly via launchd to pull external data (Jira tickets, Confluence pages) into the vault on a schedule. Using launchd instead of cron ensures missed jobs (e.g., laptop was asleep) run once on wake.

### How It Works

The wrapper script `steven/scripts/run.sh` handles the headless environment:

1. Sets up `PATH` so launchd can find the `claude` CLI
2. Logs all output to `~/steven-vault/logs/<name>/` with a timestamped filename
3. Propagates the exit code

Usage:

```bash
./steven/scripts/run.sh <name> "<prompt>"
```

The `name` argument organizes logs into subdirectories (e.g., `jira-refresh`, `confluence-sync`).

### Example Launch Agents

Save plist files to `~/Library/LaunchAgents/`, then bootstrap with `launchctl bootstrap gui/$(id -u) <plist-path>`.

**Refresh Jira tickets daily at 9am:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.steven-jira-refresh</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/steven/scripts/run.sh</string>
        <string>jira-refresh</string>
        <string>/asking-steven refresh current sprint tickets from Jira</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/steven-jira-refresh-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/steven-jira-refresh-stderr.log</string>
</dict>
</plist>
```

**Check Confluence daily at 9am:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.steven-confluence-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/steven/scripts/run.sh</string>
        <string>confluence-sync</string>
        <string>/asking-steven check Confluence for pages updated in the last 24 hours</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/steven-confluence-sync-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/steven-confluence-sync-stderr.log</string>
</dict>
</plist>
```

Replace `/path/to/` with the absolute path to this repository.

Use `/managing-launchd-agents` to create, list, edit, and manage these agents.

### Logs

Ingestion logs are written to `~/steven-vault/logs/<name>/` with the format `YYYY-MM-DD_HH-MM-SS.log`. Each log includes the prompt, full Claude output, and exit code.

### Log Rotation

The `steven/scripts/log-rotate.sh` script deletes logs older than 14 days. Schedule it as a launch agent or run manually.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system components, design decisions, and constraints.
