# Datadog Log Search Token Efficiency

## Problem

The `searching-datadog-logs` skill returns the full raw Datadog API response for up to 100 logs, pretty-printed with `indent=2`. This burns a significant number of tokens:

- **High default limit**: 100 logs returned by default, most investigations need 5-10
- **Pretty-printed JSON**: `indent=2` adds ~20-30% whitespace overhead
- **Full API wrapper**: Each log includes `id`, `type`, and double-nested `attributes.attributes` structure
- **All fields returned**: No filtering of redundant or low-value fields

## Solution

Three changes to `search_logs.py` to reduce token consumption by an estimated ~95%:

### 1. Lower default limit (100 → 10)

Change `DEFAULT_LIMIT` from 100 to 10. Users can still pass `--limit` for larger searches. This alone provides ~90% reduction in total output for typical use.

### 2. Flatten log events

Add a `flatten_log(event)` function that transforms the raw Datadog structure:

**Before** (raw Datadog response):
```json
{
  "id": "AgAAAY...",
  "type": "log",
  "attributes": {
    "status": "error",
    "service": "web-api",
    "timestamp": "2025-01-01T12:34:56.789Z",
    "host": "ip-10-0-1-42",
    "message": "Connection refused",
    "tags": ["env:prod", "team:backend"],
    "attributes": {
      "hostname": "web-api-prod-1",
      "error.kind": "ConnectionError"
    }
  }
}
```

**After** (flattened):
```json
{"status":"error","service":"web-api","timestamp":"2025-01-01T12:34:56.789Z","host":"ip-10-0-1-42","message":"Connection refused","tags":["env:prod","team:backend"],"hostname":"web-api-prod-1","error.kind":"ConnectionError"}
```

Flattening rules:
- Drop `id` and `type` (never useful for investigation)
- Promote `attributes.*` (status, service, timestamp, host, message, tags) to top level
- Merge `attributes.attributes.*` (custom attributes) into the same flat object
- Keep tags (useful for surfacing env, version, team context)

### 3. Compact JSONL output

Replace pretty-printed JSON array with:
- A header line: `# N logs found`
- One compact JSON object per line (JSONL), using `separators=(',', ':')`
- No indentation, no extra whitespace

### Example output

```
# 3 logs found
{"status":"error","service":"web-api","timestamp":"2025-01-01T12:34:56.789Z","host":"ip-10-0-1-42","message":"Connection refused","tags":["env:prod"],"error.kind":"ConnectionError"}
{"status":"error","service":"web-api","timestamp":"2025-01-01T12:34:55.123Z","host":"ip-10-0-1-43","message":"Connection refused","tags":["env:prod"],"error.kind":"ConnectionError"}
{"status":"warn","service":"web-api","timestamp":"2025-01-01T12:34:50.456Z","host":"ip-10-0-1-42","message":"Retrying connection","tags":["env:prod"]}
```

## Scope

### Changed files

- `scripts/search_logs.py` — add `flatten_log()`, change output format, lower default limit
- `scripts/test_search_logs.py` — add tests for `flatten_log()`, update output format tests

### Unchanged files

- `SKILL.md` — no changes needed (skill already says "never dump raw JSON")
- `scripts/get_credentials.py` — no changes
- `references/query-syntax.md` — no changes

## Estimated impact

| Before | After | Reduction |
|---|---|---|
| 100 logs default | 10 logs default | 90% fewer logs |
| ~300 tokens/log (pretty-printed, wrapped) | ~80 tokens/log (compact, flat) | ~73% per log |
| ~30,000 tokens typical search | ~800 tokens typical search | ~97% total |
