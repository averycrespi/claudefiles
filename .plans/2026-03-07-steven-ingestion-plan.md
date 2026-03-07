# Steven Ingestion System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Set up cron-based ingestion so Steven automatically pulls data from Jira and Confluence into the vault on a schedule.

**Architecture:** A `steven/` directory at the repo root holds scripts and a README for the Steven system. A wrapper shell script handles environment setup and logging for headless `claude -p` invocations. Cron entries call the wrapper with natural language prompts. The `/steven` skill and `references/ingest.md` already handle the actual data integration logic — this plan wires up the scheduling infrastructure.

**Tech Stack:** Bash (wrapper script), cron (scheduling), Claude Code CLI (`claude -p`), existing `/steven` skill with Atlassian MCP

---

### Task 1: Create the Ingestion Wrapper Script

**Files:**
- Create: `steven/scripts/ingest.sh`

**Step 1: Write the wrapper script**

Write `steven/scripts/ingest.sh`:

```bash
#!/usr/bin/env bash

# Wrapper for headless Steven ingestion via cron.
#
# Usage: ingest.sh "prompt for steven"
#
# Handles:
# - PATH setup so cron can find `claude`
# - Logging to ~/steven-vault/logs/
# - Exit code propagation

set -euo pipefail

PROMPT="$1"
LOG_DIR="$HOME/steven-vault/logs"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$LOG_DIR/$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

# Ensure claude is on PATH (cron has minimal environment)
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "=== Steven Ingestion ===" >> "$LOG_FILE"
echo "Time: $(date)" >> "$LOG_FILE"
echo "Prompt: $PROMPT" >> "$LOG_FILE"
echo "---" >> "$LOG_FILE"

claude -p "$PROMPT" \
  --permission-mode default \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

echo "---" >> "$LOG_FILE"
echo "Exit code: $EXIT_CODE" >> "$LOG_FILE"
echo "Finished: $(date)" >> "$LOG_FILE"

exit $EXIT_CODE
```

**Step 2: Make it executable**

Run: `chmod +x steven/scripts/ingest.sh`
Expected: No output, exit code 0

**Step 3: Create the logs directory**

Run: `mkdir -p ~/steven-vault/logs`
Expected: Directory created (or already exists)

**Step 4: Commit**

```bash
git add steven/scripts/ingest.sh
git commit -m "feat(steven): add ingestion wrapper script for cron"
```

---

### Task 2: Test Headless Invocation Manually

**Files:**
- None (manual verification)

This task validates that `claude -p` works with the `/steven` skill
before setting up cron. Run each step and verify the output.

**Step 1: Test basic headless skill invocation**

Run a minimal headless invocation to confirm the skill loads and
can read the vault:

```bash
claude -p "/steven what's on the dashboard right now?"
```

Expected: Steven reads `system/dashboard.md` and responds with
the current (mostly empty) dashboard state. No permission prompts
should block the invocation.

**Step 2: Test the wrapper script**

Run the wrapper script with the same prompt:

```bash
./steven/scripts/ingest.sh "/steven what's on the dashboard right now?"
```

Expected: Output goes to a log file in `~/steven-vault/logs/`. Check:

```bash
ls ~/steven-vault/logs/
cat ~/steven-vault/logs/*.log
```

The log should contain the prompt, Steven's response, and exit code 0.

**Step 3: Test Jira access headlessly**

Run a focused Jira query to verify MCP access works in headless mode:

```bash
claude -p "/steven refresh your knowledge of current sprint tickets in Jira"
```

Expected: Steven fetches tickets via the Atlassian MCP, creates or
updates files in `~/steven-vault/knowledge/` with `jira-` prefixed
filenames, and runs `qmd embed`. Check:

```bash
ls ~/steven-vault/knowledge/jira-*
```

If this fails with MCP authentication or permission errors, note the
error — it may require running `claude` interactively once first to
authenticate the Atlassian MCP.

**Step 4: Test Confluence access headlessly**

```bash
claude -p "/steven check Confluence for pages updated in the last 7 days and save anything relevant"
```

Expected: Steven fetches recent Confluence pages, creates or updates
files in `~/steven-vault/knowledge/` with `confluence-` prefixed
filenames, and runs `qmd embed`. Check:

```bash
ls ~/steven-vault/knowledge/confluence-*
```

**Step 5: Verify QMD index updated**

After the above ingestions, confirm the search index includes the
new files:

```bash
qmd search "jira" -c steven --files
```

Expected: Results pointing to the newly created jira files.

**Step 6: Commit**

No files to commit — verification only. But if the ingest reference
file needed adjustments based on what was learned during testing,
note them for a follow-up task.

---

### Task 3: Add Cron Entries

**Files:**
- None (system crontab)

Cron entries are managed by Avery, not committed to the repo. This
task documents the entries to add and how to install them.

**Step 1: Determine the full path to the wrapper script**

The wrapper script needs an absolute path in crontab. Use the path
to wherever this repo is checked out:

```bash
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/steven/scripts/ingest.sh"
echo "$SCRIPT_PATH"
```

For the main checkout, this will be something like:
`/Users/averycrespi/claudefiles/steven/scripts/ingest.sh`

**Step 2: Add cron entries**

Run `crontab -e` and add these entries (adjust paths to match your
system):

```crontab
# steven — refresh current sprint tickets every 2 hours during work hours
0 */2 9-18 * * 1-5 /Users/averycrespi/claudefiles/steven/scripts/ingest.sh "/steven refresh your knowledge of current sprint tickets in Jira"

# steven — sync recent Confluence updates each morning
0 8 * * 1-5 /Users/averycrespi/claudefiles/steven/scripts/ingest.sh "/steven check Confluence for pages updated in the last 24 hours and save anything relevant"

# steven — morning briefing prep
30 7 * * 1-5 /Users/averycrespi/claudefiles/steven/scripts/ingest.sh "/steven update your dashboard with today's priorities based on what you know"
```

**Step 3: Verify cron entries are installed**

Run: `crontab -l | grep steven`
Expected: The three entries above, each with a `# steven` marker

**Step 4: Commit**

No files to commit — crontab is system-level.

---

### Task 4: Add Log Rotation

**Files:**
- Create: `steven/scripts/log-rotate.sh`

Ingestion logs accumulate over time. A simple script deletes logs
older than 14 days.

**Step 1: Write the log rotation script**

Write `steven/scripts/log-rotate.sh`:

```bash
#!/usr/bin/env bash

# Delete Steven ingestion logs older than 14 days.

set -euo pipefail

LOG_DIR="$HOME/steven-vault/logs"

if [ -d "$LOG_DIR" ]; then
  find "$LOG_DIR" -name "*.log" -mtime +14 -delete
  echo "Cleaned logs older than 14 days from $LOG_DIR"
else
  echo "Log directory $LOG_DIR does not exist"
fi
```

**Step 2: Make it executable**

Run: `chmod +x steven/scripts/log-rotate.sh`
Expected: No output, exit code 0

**Step 3: Add a cron entry for log rotation**

Add to crontab (`crontab -e`):

```crontab
# steven — clean up old ingestion logs weekly
0 0 * * 0 /Users/averycrespi/claudefiles/steven/scripts/log-rotate.sh
```

**Step 4: Commit**

```bash
git add steven/scripts/log-rotate.sh
git commit -m "chore(steven): add log rotation for ingestion logs"
```

---

### Task 5: Update Documentation

**Files:**
- Modify: `CLAUDE.md` — add `steven/` to repository structure
- Create: `steven/README.md` — overview of the Steven system

**Step 1: Update the Repository Structure section in `CLAUDE.md`**

Add the `steven/` directory to the repository structure tree:

```
steven/                  # Steven — persistent work assistant
├── README.md           # Setup, usage, and cron configuration
└── scripts/            # Automation scripts
    ├── ingest.sh       # Wrapper for headless cron ingestion
    └── log-rotate.sh   # Clean up old ingestion logs
```

**Step 2: Write `steven/README.md`**

Write a README covering:
- What Steven is (persistent work assistant, Obsidian vault + QMD)
- Vault location (`~/steven-vault/`) and structure
- The `/steven` skill and how to use it
- Cron ingestion: how the wrapper script works, example cron entries,
  where logs go (`~/steven-vault/logs/`), log rotation
- Pointer to the architecture doc (`.plans/2026-03-07-steven-architecture.md`)

Keep it practical — focused on setup and operation, not design rationale.

**Step 3: Commit**

```bash
git add CLAUDE.md steven/README.md
git commit -m "docs(steven): add README and update repo structure"
```
