# Searching Datadog Logs — Design

## Overview

A Claude skill that teaches Claude how to search Datadog logs via the API. Supports two workflows: error-driven (paste an error, find related logs) and exploratory (describe what to search for). Uses Python helper scripts in the skill directory and macOS Keychain for credential storage.

## Skill Structure

```
claude/skills/searching-datadog-logs/
├── SKILL.md                          # Trigger description, workflows, instructions
├── scripts/
│   ├── search_logs.py                # Log search with pagination
│   ├── get_log.py                    # Fetch single log by ID
│   └── get_credentials.py           # Keychain credential retrieval (module)
└── references/
    └── query-syntax.md              # Datadog log query syntax reference
```

## Script Interfaces

### search_logs.py

```
python search_logs.py --query <query> [--from <timestamp>] [--to <timestamp>] [--limit <n>]
```

- `--query` (required): Datadog log query string (e.g., `service:web-api status:error`)
- `--from` / `--to` (optional): ISO 8601 timestamps or relative strings like `now-1h`. Defaults to last 15 minutes.
- `--limit` (optional): Max number of logs to return. Default 100, cap at 1000.
- **Output:** JSON array of log objects with key fields (timestamp, service, status, message, host, attributes).
- **Errors:** Non-zero exit code + JSON error message to stderr.
- Handles pagination internally.

### get_log.py

```
python get_log.py --id <log_id>
```

- `--id` (required): The log event ID from a previous search result.
- **Output:** Full JSON log object with all attributes.
- **Errors:** Non-zero exit code + JSON error message to stderr.

### get_credentials.py (internal module)

- Exposes `get_credentials() -> (api_key, app_key)`.
- Reads from macOS Keychain using `security find-generic-password`.
- Keychain service name: `datadog-api` with two accounts: `api-key` and `app-key`.
- Raises clear error with setup commands if credentials not found.

## Authentication

Credentials stored in macOS Keychain. Users set up before first use:

```bash
security add-generic-password -s datadog-api -a api-key -w <YOUR_API_KEY>
security add-generic-password -s datadog-api -a app-key -w <YOUR_APP_KEY>
```

## API Details

- **Site:** `datadoghq.com` (US1), hardcoded.
- **Search endpoint:** `POST /api/v2/logs/events/search`
- **Detail endpoint:** `GET /api/v2/logs/events/{log_id}`
- **Dependencies:** Python 3 standard library only (`urllib.request`, `json`, `argparse`, `subprocess`). No third-party packages.

## Workflows

### Error-driven

1. User pastes an error message or stack trace.
2. Claude extracts key identifiers — service name, error type, relevant keywords.
3. Claude constructs a Datadog query using the query syntax reference.
4. Claude runs `search_logs.py` with the query and a reasonable time range.
5. Claude summarizes the results — count, common patterns, timestamps.
6. If a specific log looks relevant, Claude runs `get_log.py` for full details.
7. Claude presents findings and suggests next steps.

### Exploratory

1. User describes what they're looking for (service, keywords, time range).
2. Claude constructs the query, asking clarifying questions only if truly ambiguous.
3. Claude runs `search_logs.py` and summarizes results.
4. Claude may refine the query based on initial results (narrow time range, add facets).
5. Claude drills into specific logs with `get_log.py` as needed.

## SKILL.md Behavior

- Always load `references/query-syntax.md` before constructing a query.
- Summarize results rather than dumping raw JSON — highlight counts, patterns, notable entries.
- When no results found, suggest query modifications (broader time range, fewer filters, check spelling).
- Include the Datadog web UI link for the query so users can continue investigating in the browser.

## Error Handling

- **Missing credentials:** Exit with message containing setup commands.
- **Authentication failures (403):** Inform user keys may be invalid or lack `logs_read_data` permission.
- **No results:** Suggest query modifications.
- **Rate limiting (429):** Include retry-after value. Claude waits and retries or informs user.
- **Network errors:** Clear message suggesting connectivity check.
- **Large result sets:** `--limit` caps results. Claude informs user if truncated and suggests narrowing query.

## Excluded (YAGNI)

- No metrics querying — separate concern.
- No log analytics/aggregation endpoints — search + detail covers the core need.
- No multi-site support — hardcoded to datadoghq.com.
- No caching — queries are cheap and results change constantly.
- No third-party Python dependencies.
