# Searching Datadog Logs Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Create a Claude skill that searches Datadog logs via the API using Python helper scripts and macOS Keychain for credentials.

**Architecture:** The skill has a SKILL.md with workflow instructions, Python scripts for API calls (`get_credentials.py`, `search_logs.py`, `get_log.py`), and a query syntax reference document. Scripts use only Python standard library (`urllib.request`, `json`, `argparse`, `subprocess`). Credentials are stored in macOS Keychain.

**Tech Stack:** Python 3 (stdlib only), macOS Keychain (`security` CLI), Datadog API v2

---

### Task 1: Initialize skill and create get_credentials module

**Files:**
- Create: `claude/skills/searching-datadog-logs/SKILL.md` (via init script, then customize)
- Create: `claude/skills/searching-datadog-logs/scripts/get_credentials.py`
- Test: `claude/skills/searching-datadog-logs/scripts/test_get_credentials.py`

**Step 1: Initialize the skill directory**

Run:
```bash
python3 claude/skills/creating-skills/scripts/init_skill.py searching-datadog-logs --path claude/skills
```

Then delete the example files that won't be needed:
```bash
rm claude/skills/searching-datadog-logs/scripts/example.py
rm claude/skills/searching-datadog-logs/references/api_reference.md
rm -rf claude/skills/searching-datadog-logs/assets/
```

**Step 2: Write the failing test**

Create `claude/skills/searching-datadog-logs/scripts/test_get_credentials.py`:

```python
#!/usr/bin/env python3
"""Tests for get_credentials module."""

import subprocess
import unittest
from unittest.mock import patch, MagicMock

from get_credentials import get_credentials, CredentialError


class TestGetCredentials(unittest.TestCase):
    @patch("get_credentials.subprocess.run")
    def test_returns_api_key_and_app_key(self, mock_run):
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="fake-api-key\n"),
            MagicMock(returncode=0, stdout="fake-app-key\n"),
        ]
        api_key, app_key = get_credentials()
        self.assertEqual(api_key, "fake-api-key")
        self.assertEqual(app_key, "fake-app-key")

    @patch("get_credentials.subprocess.run")
    def test_raises_on_missing_api_key(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=44, stdout="", stderr="security: SecKeychainSearchCopyNext"
        )
        with self.assertRaises(CredentialError) as ctx:
            get_credentials()
        self.assertIn("security add-generic-password", str(ctx.exception))

    @patch("get_credentials.subprocess.run")
    def test_strips_whitespace_from_keys(self, mock_run):
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="  key-with-spaces  \n"),
            MagicMock(returncode=0, stdout="  app-key  \n"),
        ]
        api_key, app_key = get_credentials()
        self.assertEqual(api_key, "key-with-spaces")
        self.assertEqual(app_key, "app-key")


if __name__ == "__main__":
    unittest.main()
```

**Step 3: Run test to verify it fails**

Run:
```bash
cd claude/skills/searching-datadog-logs/scripts && python3 -m pytest test_get_credentials.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'get_credentials'`

**Step 4: Write minimal implementation**

Create `claude/skills/searching-datadog-logs/scripts/get_credentials.py`:

```python
#!/usr/bin/env python3
"""Retrieve Datadog API credentials from macOS Keychain."""

import subprocess

KEYCHAIN_SERVICE = "datadog-api"


class CredentialError(Exception):
    """Raised when credentials cannot be retrieved from Keychain."""
    pass


def _read_keychain(account):
    """Read a password from macOS Keychain."""
    result = subprocess.run(
        [
            "security",
            "find-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", account,
            "-w",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise CredentialError(
            f"Credential '{account}' not found in Keychain.\n"
            f"Store it with:\n"
            f"  security add-generic-password -s {KEYCHAIN_SERVICE} -a {account} -w <YOUR_KEY>\n"
        )
    return result.stdout.strip()


def get_credentials():
    """Return (api_key, app_key) from macOS Keychain.

    Raises CredentialError with setup instructions if keys are missing.
    """
    api_key = _read_keychain("api-key")
    app_key = _read_keychain("app-key")
    return api_key, app_key
```

**Step 5: Run test to verify it passes**

Run:
```bash
cd claude/skills/searching-datadog-logs/scripts && python3 -m pytest test_get_credentials.py -v
```
Expected: All 3 tests PASS

**Step 6: Commit**

```bash
git add claude/skills/searching-datadog-logs/
git commit -m "feat(searching-datadog-logs): add skill skeleton and credentials module"
```

---

### Task 2: Create search_logs.py script

**Files:**
- Create: `claude/skills/searching-datadog-logs/scripts/search_logs.py`
- Test: `claude/skills/searching-datadog-logs/scripts/test_search_logs.py`

**Step 1: Write the failing test**

Create `claude/skills/searching-datadog-logs/scripts/test_search_logs.py`:

```python
#!/usr/bin/env python3
"""Tests for search_logs script."""

import json
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError
from io import BytesIO

from search_logs import search_logs, build_request_body


class TestBuildRequestBody(unittest.TestCase):
    def test_minimal_query(self):
        body = build_request_body(query="service:web-api")
        self.assertEqual(body["filter"]["query"], "service:web-api")
        self.assertIn("from", body["filter"])
        self.assertIn("to", body["filter"])
        self.assertEqual(body["page"]["limit"], 100)

    def test_custom_time_range(self):
        body = build_request_body(
            query="status:error",
            time_from="2025-01-01T00:00:00Z",
            time_to="2025-01-02T00:00:00Z",
        )
        self.assertEqual(body["filter"]["from"], "2025-01-01T00:00:00Z")
        self.assertEqual(body["filter"]["to"], "2025-01-02T00:00:00Z")

    def test_custom_limit(self):
        body = build_request_body(query="*", limit=50)
        self.assertEqual(body["page"]["limit"], 50)

    def test_limit_capped_at_1000(self):
        body = build_request_body(query="*", limit=5000)
        self.assertEqual(body["page"]["limit"], 1000)

    def test_cursor_included_when_provided(self):
        body = build_request_body(query="*", cursor="abc123")
        self.assertEqual(body["page"]["cursor"], "abc123")


class TestSearchLogs(unittest.TestCase):
    @patch("search_logs.get_credentials")
    @patch("search_logs.urllib.request.urlopen")
    def test_returns_logs_from_single_page(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("api-key", "app-key")
        response_data = {
            "data": [
                {"id": "log1", "attributes": {"message": "hello"}},
                {"id": "log2", "attributes": {"message": "world"}},
            ],
            "meta": {"page": {}},
        }
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_data).encode()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        logs = search_logs(query="service:web-api")
        self.assertEqual(len(logs), 2)
        self.assertEqual(logs[0]["id"], "log1")

    @patch("search_logs.get_credentials")
    @patch("search_logs.urllib.request.urlopen")
    def test_paginates_until_no_cursor(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("api-key", "app-key")

        page1 = {
            "data": [{"id": "log1", "attributes": {}}],
            "meta": {"page": {"after": "cursor-page2"}},
        }
        page2 = {
            "data": [{"id": "log2", "attributes": {}}],
            "meta": {"page": {}},
        }

        resp1 = MagicMock()
        resp1.read.return_value = json.dumps(page1).encode()
        resp1.__enter__ = lambda s: s
        resp1.__exit__ = MagicMock(return_value=False)

        resp2 = MagicMock()
        resp2.read.return_value = json.dumps(page2).encode()
        resp2.__enter__ = lambda s: s
        resp2.__exit__ = MagicMock(return_value=False)

        mock_urlopen.side_effect = [resp1, resp2]

        logs = search_logs(query="*", limit=200)
        self.assertEqual(len(logs), 2)

    @patch("search_logs.get_credentials")
    @patch("search_logs.urllib.request.urlopen")
    def test_stops_at_limit(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("api-key", "app-key")
        response_data = {
            "data": [{"id": f"log{i}", "attributes": {}} for i in range(5)],
            "meta": {"page": {"after": "more"}},
        }
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_data).encode()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        logs = search_logs(query="*", limit=3)
        self.assertEqual(len(logs), 3)


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd claude/skills/searching-datadog-logs/scripts && python3 -m pytest test_search_logs.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'search_logs'`

**Step 3: Write minimal implementation**

Create `claude/skills/searching-datadog-logs/scripts/search_logs.py`:

```python
#!/usr/bin/env python3
"""Search Datadog logs via the Logs Search API.

Usage:
    python search_logs.py --query <query> [--from <timestamp>] [--to <timestamp>] [--limit <n>]

Examples:
    python search_logs.py --query "service:web-api status:error"
    python search_logs.py --query "service:web-api" --from "2025-01-01T00:00:00Z" --to "2025-01-02T00:00:00Z"
    python search_logs.py --query "@user.id:12345" --limit 50
"""

import argparse
import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

from get_credentials import get_credentials

DD_SITE = "datadoghq.com"
SEARCH_URL = f"https://api.{DD_SITE}/api/v2/logs/events/search"
MAX_LIMIT = 1000
DEFAULT_LIMIT = 100
PAGE_SIZE = 100


def build_request_body(query, time_from=None, time_to=None, limit=DEFAULT_LIMIT, cursor=None):
    """Build the JSON request body for the log search API."""
    now = datetime.now(timezone.utc)
    if time_to is None:
        time_to = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    if time_from is None:
        time_from = (now - timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ")

    limit = min(limit, MAX_LIMIT)

    body = {
        "filter": {
            "query": query,
            "from": time_from,
            "to": time_to,
        },
        "page": {
            "limit": min(limit, PAGE_SIZE),
        },
        "sort": "-timestamp",
    }
    if cursor:
        body["page"]["cursor"] = cursor
    return body


def search_logs(query, time_from=None, time_to=None, limit=DEFAULT_LIMIT):
    """Search Datadog logs, handling pagination automatically.

    Returns a list of log event dicts, up to `limit` entries.
    """
    api_key, app_key = get_credentials()
    all_logs = []
    cursor = None

    while len(all_logs) < limit:
        body = build_request_body(
            query=query,
            time_from=time_from,
            time_to=time_to,
            limit=limit,
            cursor=cursor,
        )
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            SEARCH_URL,
            data=data,
            headers={
                "Content-Type": "application/json",
                "DD-API-KEY": api_key,
                "DD-APPLICATION-KEY": app_key,
            },
            method="POST",
        )

        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())

        logs = result.get("data", [])
        if not logs:
            break

        all_logs.extend(logs)
        cursor = result.get("meta", {}).get("page", {}).get("after")
        if not cursor:
            break

    return all_logs[:limit]


def main():
    parser = argparse.ArgumentParser(description="Search Datadog logs")
    parser.add_argument("--query", required=True, help="Datadog log query string")
    parser.add_argument("--from", dest="time_from", help="Start time (ISO 8601 or relative like 'now-1h'). Default: 15 minutes ago")
    parser.add_argument("--to", dest="time_to", help="End time (ISO 8601 or relative). Default: now")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help=f"Max logs to return (default {DEFAULT_LIMIT}, max {MAX_LIMIT})")
    args = parser.parse_args()

    try:
        logs = search_logs(
            query=args.query,
            time_from=args.time_from,
            time_to=args.time_to,
            limit=args.limit,
        )
        json.dump(logs, sys.stdout, indent=2)
        print()
    except Exception as e:
        json.dump({"error": str(e)}, sys.stderr)
        print(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd claude/skills/searching-datadog-logs/scripts && python3 -m pytest test_search_logs.py -v
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add claude/skills/searching-datadog-logs/scripts/search_logs.py claude/skills/searching-datadog-logs/scripts/test_search_logs.py
git commit -m "feat(searching-datadog-logs): add search_logs script with pagination"
```

---

### Task 3: Create get_log.py script

**Files:**
- Create: `claude/skills/searching-datadog-logs/scripts/get_log.py`
- Test: `claude/skills/searching-datadog-logs/scripts/test_get_log.py`

**Step 1: Write the failing test**

Create `claude/skills/searching-datadog-logs/scripts/test_get_log.py`:

```python
#!/usr/bin/env python3
"""Tests for get_log script."""

import json
import unittest
from unittest.mock import patch, MagicMock

from get_log import get_log


class TestGetLog(unittest.TestCase):
    @patch("get_log.get_credentials")
    @patch("get_log.urllib.request.urlopen")
    def test_returns_log_by_id(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("api-key", "app-key")
        response_data = {
            "data": {
                "id": "abc123",
                "type": "log",
                "attributes": {
                    "message": "Something happened",
                    "service": "web-api",
                    "status": "error",
                    "timestamp": "2025-01-01T00:00:00Z",
                },
            }
        }
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_data).encode()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        log = get_log("abc123")
        self.assertEqual(log["id"], "abc123")
        self.assertEqual(log["attributes"]["service"], "web-api")

    @patch("get_log.get_credentials")
    @patch("get_log.urllib.request.urlopen")
    def test_sends_correct_headers(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("my-api-key", "my-app-key")
        response_data = {"data": {"id": "abc123", "attributes": {}}}
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_data).encode()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        get_log("abc123")

        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.get_header("Dd-api-key"), "my-api-key")
        self.assertEqual(req.get_header("Dd-application-key"), "my-app-key")


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd claude/skills/searching-datadog-logs/scripts && python3 -m pytest test_get_log.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'get_log'`

**Step 3: Write minimal implementation**

Create `claude/skills/searching-datadog-logs/scripts/get_log.py`:

```python
#!/usr/bin/env python3
"""Fetch a single Datadog log event by ID.

Usage:
    python get_log.py --id <log_id>
"""

import argparse
import json
import sys
import urllib.request

from get_credentials import get_credentials

DD_SITE = "datadoghq.com"
LOG_URL = f"https://api.{DD_SITE}/api/v2/logs/events"


def get_log(log_id):
    """Fetch a single log event by ID.

    Returns the log event dict.
    """
    api_key, app_key = get_credentials()
    req = urllib.request.Request(
        f"{LOG_URL}/{log_id}",
        headers={
            "DD-API-KEY": api_key,
            "DD-APPLICATION-KEY": app_key,
        },
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())

    return result["data"]


def main():
    parser = argparse.ArgumentParser(description="Fetch a Datadog log event by ID")
    parser.add_argument("--id", required=True, dest="log_id", help="Log event ID")
    args = parser.parse_args()

    try:
        log = get_log(args.log_id)
        json.dump(log, sys.stdout, indent=2)
        print()
    except Exception as e:
        json.dump({"error": str(e)}, sys.stderr)
        print(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd claude/skills/searching-datadog-logs/scripts && python3 -m pytest test_get_log.py -v
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add claude/skills/searching-datadog-logs/scripts/get_log.py claude/skills/searching-datadog-logs/scripts/test_get_log.py
git commit -m "feat(searching-datadog-logs): add get_log script"
```

---

### Task 4: Create query syntax reference document

**Files:**
- Create: `claude/skills/searching-datadog-logs/references/query-syntax.md`

**Step 1: Write the reference document**

Create `claude/skills/searching-datadog-logs/references/query-syntax.md`:

```markdown
# Datadog Log Query Syntax Reference

## Basic Search

- Free text search: `error timeout`
- Exact phrase: `"connection refused"`

## Facet Search

Search by indexed attributes using `@` prefix or reserved facets:

- Service: `service:web-api`
- Status: `status:error` (valid values: `emergency`, `alert`, `critical`, `error`, `warn`, `info`, `debug`)
- Host: `host:prod-server-01`
- Source: `source:python`
- Custom attribute: `@user.id:12345`
- Tag: `env:production`, `version:1.2.3`

## Operators

- Equals: `service:web-api`
- Not equals: `-service:web-api`
- Wildcard: `service:web-*`
- Numeric comparison: `@duration:>1000`, `@duration:[100 TO 500]`
- Exists: `_exists_:@user.id`
- Does not exist: `-_exists_:@user.id`

## Boolean Logic

- AND (implicit): `service:web-api status:error` (space = AND)
- AND (explicit): `service:web-api AND status:error`
- OR: `service:web-api OR service:worker`
- Grouping: `(service:web-api OR service:worker) AND status:error`

## Wildcards

- Single character: `service:web-?pi`
- Multiple characters: `service:web-*`
- Wildcards work in values, not in facet names

## Escaping

- Special characters need escaping with `\`: `+`, `-`, `=`, `&&`, `||`, `!`, `(`, `)`, `{`, `}`, `[`, `]`, `^`, `"`, `~`, `*`, `?`, `:`, `\`, `/`
- Example: `@message:file\.txt`

## Common Patterns

Search for errors in a service:
```
service:web-api status:error
```

Search for a specific error message:
```
service:web-api "NullPointerException"
```

Search by user and status:
```
@user.email:user@example.com status:error
```

Search with numeric range:
```
@http.status_code:[500 TO 599]
```

Exclude noisy logs:
```
service:web-api -@logger.name:HealthCheck
```
```

**Step 2: Commit**

```bash
git add claude/skills/searching-datadog-logs/references/query-syntax.md
git commit -m "docs(searching-datadog-logs): add query syntax reference"
```

---

### Task 5: Write SKILL.md

**Files:**
- Modify: `claude/skills/searching-datadog-logs/SKILL.md` (replace the generated template)

**Step 1: Write the SKILL.md**

Replace the entire contents of `claude/skills/searching-datadog-logs/SKILL.md` with:

```markdown
---
name: searching-datadog-logs
description: Use when searching Datadog logs, investigating errors in Datadog, or looking up log entries for a service or time range
---

# Searching Datadog Logs

Search Datadog logs via the API. Supports error-driven investigation (paste an error, find related logs) and exploratory search (describe what to search for).

## Prerequisites

Credentials must be stored in macOS Keychain before first use:

```bash
security add-generic-password -s datadog-api -a api-key -w <YOUR_DD_API_KEY>
security add-generic-password -s datadog-api -a app-key -w <YOUR_DD_APP_KEY>
```

## Workflow

### Error-Driven Investigation

When the user pastes an error message or stack trace:

1. Extract key identifiers — service name, error type, keywords
2. Load `references/query-syntax.md` and construct a Datadog query
3. Run `scripts/search_logs.py --query "<query>"` with an appropriate time range
4. Summarize results — count, common patterns, timestamps, notable entries
5. Drill into specific logs with `scripts/get_log.py --id <log_id>` if needed
6. Present findings and suggest next steps

### Exploratory Search

When the user describes what to search for:

1. Load `references/query-syntax.md` and construct a query from the description
2. Run `scripts/search_logs.py --query "<query>"` with the requested time range
3. Summarize results — count, patterns, notable entries
4. Refine the query if initial results are too broad or narrow
5. Drill into specific logs with `scripts/get_log.py --id <log_id>` as needed

## Scripts

### search_logs.py

```
python scripts/search_logs.py --query <query> [--from <timestamp>] [--to <timestamp>] [--limit <n>]
```

- `--query`: Datadog log query string (required)
- `--from`: Start time, ISO 8601 (default: 15 minutes ago)
- `--to`: End time, ISO 8601 (default: now)
- `--limit`: Max logs to return (default: 100, max: 1000)
- Outputs JSON array of log events to stdout
- Handles pagination automatically

### get_log.py

```
python scripts/get_log.py --id <log_id>
```

- `--id`: Log event ID from a search result (required)
- Outputs full JSON log event to stdout

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
- **403 Forbidden**: Keys may be invalid or lack `logs_read_data` permission
- **429 Rate Limited**: Wait and retry, or inform the user
- **Network errors**: Suggest checking connectivity
```

**Step 2: Commit**

```bash
git add claude/skills/searching-datadog-logs/SKILL.md
git commit -m "feat(searching-datadog-logs): write SKILL.md with workflows and instructions"
```

---

### Task 6: Update project documentation

**Files:**
- Modify: `claude/skills/searching-datadog-logs/SKILL.md` — already done in Task 5
- Modify: `CLAUDE.md:73-77` — add searching-datadog-logs to the Integrations table
- Modify: `README.md:129-148` — add Datadog to the Integrations section

**Step 1: Update CLAUDE.md**

Add `searching-datadog-logs` to the Integrations table in `CLAUDE.md`. Insert a new row after the Atlassian MCP row (line 76):

```markdown
| Integration   | Purpose                                             |
| ------------- | --------------------------------------------------- |
| Atlassian MCP | Read/write access to Jira, Confluence, and Compass  |
```

Change to:

```markdown
| Integration              | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| Atlassian MCP            | Read/write access to Jira, Confluence, and Compass  |
| `searching-datadog-logs` | Search Datadog logs via the API                     |
```

**Step 2: Update README.md**

Add a Datadog section to the Integrations section in `README.md`, after the Atlassian section (after line 148). Insert before the `## Attribution` line:

```markdown
### Datadog Logs

Search Datadog logs directly from Claude using the `searching-datadog-logs` skill.

**Setup:**

1. Store your Datadog API credentials in macOS Keychain:
   ```bash
   security add-generic-password -s datadog-api -a api-key -w <YOUR_DD_API_KEY>
   security add-generic-password -s datadog-api -a app-key -w <YOUR_DD_APP_KEY>
   ```
2. Done - ask Claude to search Datadog logs

**Capabilities:**
- Search logs by query, service, status, time range
- Fetch full log details by ID
- Error-driven investigation from stack traces
- Exploratory search with query refinement
```

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add searching-datadog-logs to project documentation"
```
