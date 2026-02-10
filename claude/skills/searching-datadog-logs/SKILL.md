---
name: searching-datadog-logs
description: Use when searching Datadog logs, investigating errors in Datadog, or looking up log entries for a service or time range
---

# Searching Datadog Logs

Search Datadog logs via the API. Supports error-driven investigation (paste an error, find related logs) and exploratory search (describe what to search for).

## Prerequisites

Credentials must be stored in macOS Keychain before first use:

```bash
security add-generic-password -s searching-datadog-logs -a api-key -w <YOUR_DD_API_KEY>
security add-generic-password -s searching-datadog-logs -a app-key -w <YOUR_DD_APP_KEY>
```

## Workflow

### Error-Driven Investigation

When the user pastes an error message or stack trace:

1. Extract key identifiers — service name, error type, keywords
2. Load `references/query-syntax.md` and construct a Datadog query
3. Run `~/.claude/skills/searching-datadog-logs/scripts/search_logs --query "<query>"` with an appropriate time range
4. Summarize results — count, common patterns, timestamps, notable entries
5. Examine individual log entries from the search output for deeper investigation
6. Present findings and suggest next steps

### Exploratory Search

When the user describes what to search for:

1. Load `references/query-syntax.md` and construct a query from the description
2. Run `~/.claude/skills/searching-datadog-logs/scripts/search_logs --query "<query>"` with the requested time range
3. Summarize results — count, patterns, notable entries
4. Refine the query if initial results are too broad or narrow
5. Examine individual log entries from the search output for deeper investigation

## Scripts

### search_logs

```
~/.claude/skills/searching-datadog-logs/scripts/search_logs --query <query> [--from <timestamp>] [--to <timestamp>] [--limit <n>]
```

- `--query`: Datadog log query string (required)
- `--from`: Start time, ISO 8601 (default: 24 hours ago)
- `--to`: End time, ISO 8601 (default: now)
- `--limit`: Max logs to return (default: 10, max: 1000)
- Outputs JSON array of log events to stdout
- Handles pagination automatically

## Presenting Results

- Summarize results — never dump raw JSON to the user
- Highlight: match count, time distribution, common error patterns, affected services
- When results are truncated (hit limit), mention this and suggest narrowing the query
- Include a Datadog web UI link so the user can continue investigating in the browser:
  `https://app.datadoghq.com/logs?query=<url-encoded-query>&from_ts=<epoch_ms>&to_ts=<epoch_ms>`

## When No Results Are Found

Suggest modifications:
- Broaden the time range
- Remove or relax filters
- Check facet and attribute names for typos
- Try wildcard matching

## Error Handling

- **Missing credentials**: Relay the setup commands from the error message
- **403 Forbidden**: Keys may be invalid or lack `logs_read_data` and `logs_read_index_data` permissions
- **429 Rate Limited**: Wait and retry, or inform the user
- **Network errors**: Suggest checking connectivity
