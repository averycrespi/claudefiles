# Datadog Token Efficiency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Reduce token consumption of the Datadog log search skill by ~97% through lower default limits, log flattening, and compact output.

**Architecture:** Add a `flatten_log()` function to transform raw Datadog API responses into flat dicts. Change output from pretty-printed JSON array to compact JSONL with a count header. Lower default limit from 100 to 10.

**Tech Stack:** Python 3 (stdlib only), unittest

---

### Task 1: Add `flatten_log()` with tests

**Files:**
- Modify: `claude/skills/searching-datadog-logs/scripts/test_search_logs.py:1-10` (add import)
- Modify: `claude/skills/searching-datadog-logs/scripts/test_search_logs.py:110-113` (add test class before `__main__`)
- Modify: `claude/skills/searching-datadog-logs/scripts/search_logs.py:26-27` (add function after constants)

**Step 1: Write the failing tests**

Add to `test_search_logs.py` — update the import on line 10 and add a new test class before the `if __name__` block:

Update the import:
```python
from search_logs import search_logs, build_request_body, flatten_log
```

Add this test class before `if __name__ == "__main__":`:
```python
class TestFlattenLog(unittest.TestCase):
    def test_promotes_attributes_to_top_level(self):
        raw = {
            "id": "AgAAAY123",
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
                    "error.kind": "ConnectionError",
                },
            },
        }
        result = flatten_log(raw)
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["service"], "web-api")
        self.assertEqual(result["timestamp"], "2025-01-01T12:34:56.789Z")
        self.assertEqual(result["host"], "ip-10-0-1-42")
        self.assertEqual(result["message"], "Connection refused")
        self.assertEqual(result["tags"], ["env:prod", "team:backend"])
        self.assertEqual(result["hostname"], "web-api-prod-1")
        self.assertEqual(result["error.kind"], "ConnectionError")

    def test_drops_id_and_type(self):
        raw = {
            "id": "AgAAAY123",
            "type": "log",
            "attributes": {
                "message": "hello",
                "attributes": {},
            },
        }
        result = flatten_log(raw)
        self.assertNotIn("id", result)
        self.assertNotIn("type", result)

    def test_handles_missing_nested_attributes(self):
        raw = {
            "id": "log1",
            "type": "log",
            "attributes": {
                "status": "info",
                "message": "ok",
            },
        }
        result = flatten_log(raw)
        self.assertEqual(result["status"], "info")
        self.assertEqual(result["message"], "ok")

    def test_handles_empty_attributes(self):
        raw = {"id": "log1", "type": "log", "attributes": {}}
        result = flatten_log(raw)
        self.assertEqual(result, {})
```

**Step 2: Run tests to verify they fail**

Run: `python -m pytest claude/skills/searching-datadog-logs/scripts/test_search_logs.py::TestFlattenLog -v`
Expected: FAIL with `ImportError: cannot import name 'flatten_log'`

**Step 3: Write minimal implementation**

Add to `search_logs.py` after the constants (after line 25, before `build_request_body`):

```python
def flatten_log(event):
    """Flatten a raw Datadog log event into a compact dict.

    Drops id and type, promotes attributes to top level,
    and merges nested custom attributes.
    """
    attrs = event.get("attributes", {})
    flat = {}
    for key, value in attrs.items():
        if key == "attributes":
            continue
        flat[key] = value
    nested = attrs.get("attributes", {})
    for key, value in nested.items():
        flat[key] = value
    return flat
```

**Step 4: Run tests to verify they pass**

Run: `python -m pytest claude/skills/searching-datadog-logs/scripts/test_search_logs.py::TestFlattenLog -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add claude/skills/searching-datadog-logs/scripts/search_logs.py claude/skills/searching-datadog-logs/scripts/test_search_logs.py
git commit -m "feat(searching-datadog-logs): add flatten_log function"
```

---

### Task 2: Change output format to compact JSONL and lower default limit

**Files:**
- Modify: `claude/skills/searching-datadog-logs/scripts/search_logs.py:24` (change DEFAULT_LIMIT)
- Modify: `claude/skills/searching-datadog-logs/scripts/search_logs.py:113-114` (change output in main)
- Modify: `claude/skills/searching-datadog-logs/scripts/test_search_logs.py:19` (update default limit assertion)

**Step 1: Write/update tests for new default limit and output format**

In `test_search_logs.py`, update the default limit assertion in `TestBuildRequestBody.test_minimal_query` — change line 19:

```python
        self.assertEqual(body["page"]["limit"], 10)
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest claude/skills/searching-datadog-logs/scripts/test_search_logs.py::TestBuildRequestBody::test_minimal_query -v`
Expected: FAIL with `AssertionError: 100 != 10`

**Step 3: Change DEFAULT_LIMIT**

In `search_logs.py`, change line 24:
```python
DEFAULT_LIMIT = 10
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest claude/skills/searching-datadog-logs/scripts/test_search_logs.py::TestBuildRequestBody::test_minimal_query -v`
Expected: PASS

**Step 5: Update output format in main()**

In `search_logs.py`, replace lines 113-114 (the `json.dump` and `print` lines inside the try block):

```python
        print(f"# {len(logs)} logs found")
        for log in logs:
            print(json.dumps(flatten_log(log), separators=(",", ":")))
```

Also update the help text on line 103 to reflect the new default:
```python
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help=f"Max logs to return (default {DEFAULT_LIMIT}, max {MAX_LIMIT})")
```

(This line is already dynamic via the f-string, so it will automatically update when `DEFAULT_LIMIT` changes. No edit needed — just verify.)

**Step 6: Run full test suite**

Run: `python -m pytest claude/skills/searching-datadog-logs/scripts/test_search_logs.py -v`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add claude/skills/searching-datadog-logs/scripts/search_logs.py claude/skills/searching-datadog-logs/scripts/test_search_logs.py
git commit -m "refactor(searching-datadog-logs): compact JSONL output and lower default limit"
```

<!-- No documentation updates needed — SKILL.md already says "never dump raw JSON" and the --limit help text updates dynamically -->
