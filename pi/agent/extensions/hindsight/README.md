# Hindsight Extension

The Hindsight extension gives Pi one explicit `hindsight` tool for memory work against a configured Hindsight bank.

V1 is explicit-only: it does not automatically recall, retain, ingest sessions, create banks, read URLs, or provide subagents automatic memory access. If a subagent needs memory, recall bounded facts first and include them in the subagent prompt.

## Tool

`hindsight` supports three actions:

- `retain` stores provided text in Hindsight for extraction and consolidation.
- `recall` returns raw memory facts and provenance for agent-side reasoning.
- `reflect` asks Hindsight to synthesize an answer from memory and return grounding data from the API.

Examples:

```json
{
  "action": "retain",
  "content": "ABC-123 requires the importer to ignore archived rows.",
  "source": "external",
  "kind": "semantic",
  "tags": ["ticket:abc-123"],
  "document_id": "ticket-abc-123"
}
```

```json
{
  "action": "recall",
  "query": "What do we know about ABC-123?",
  "include_source_facts": true
}
```

```json
{
  "action": "reflect",
  "query": "Summarize the implementation constraints for ABC-123.",
  "include_facts": true
}
```

## Configuration

Settings live under `extension:hindsight`. Environment variables override settings.

| Field             | Default                 | Environment override          | Description                                                                      |
| ----------------- | ----------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `baseUrl`         | `http://localhost:8888` | `HINDSIGHT_BASE_URL`          | Hindsight API base URL.                                                          |
| `apiKey`          | unset                   | `HINDSIGHT_API_KEY`           | Bearer token. Required for tool network calls and masked by `/hindsight-config`. |
| `bankId`          | unset                   | `HINDSIGHT_BANK_ID`           | Hindsight bank ID. Required for tool network calls.                              |
| `defaultScope`    | `repo`                  | `HINDSIGHT_DEFAULT_SCOPE`     | Default scope: `repo` or `global`.                                               |
| `defaultTags`     | `[]`                    | `HINDSIGHT_DEFAULT_TAGS`      | Extra default tags. Env format is comma-separated.                               |
| `recallMaxTokens` | `1200`                  | `HINDSIGHT_RECALL_MAX_TOKENS` | Server recall token hint. Local output bounds still apply.                       |
| `recallBudget`    | `mid`                   | `HINDSIGHT_RECALL_BUDGET`     | Recall budget: `low`, `mid`, or `high`.                                          |
| `reflectBudget`   | `low`                   | `HINDSIGHT_REFLECT_BUDGET`    | Reflect budget: `low`, `mid`, or `high`.                                         |
| `tagsMatch`       | `any_strict`            | `HINDSIGHT_TAGS_MATCH`        | Recall/reflect tag matching: `any`, `any_strict`, `all`, or `all_strict`.        |

```json
{
  "extension:hindsight": {
    "baseUrl": "https://hindsight.example.com",
    "apiKey": "...",
    "bankId": "main",
    "defaultScope": "repo",
    "defaultTags": ["team:example"]
  }
}
```

Run `/hindsight-config` to inspect the effective parsed config. `apiKey` is masked.

## Tagging and scope

All actions use deterministic tags:

- `scope:global` or `scope:repo`
- `repo:<base-repo-name>` when scope is `repo`
- `source:<manual|external|agent>` for retained content only; recall/reflect do not source-filter by default
- `kind:<semantic|episodic|procedural>` when provided for retained content
- configured `defaultTags`
- caller-provided tags

Tags are lowercased and normalized to safe separators. Repo scope derives the base repository name from Git metadata. In Git worktrees, the tag uses the common base repository name instead of the worktree directory name. Non-Git directories fall back to the current directory basename.

## Logging

This extension writes no retained logs or temporary output. Recoverable tool errors are returned as agent-readable tool text.

## Prior art

- [Hindsight API docs](https://hindsight.vectorize.io/developer/api/quickstart) — upstream retain, recall, and reflect concepts that this extension exposes as one explicit Pi tool.
- [Your agent needs three kinds of memory, not one](https://samfoy.github.io/circuit-break/posts/your-agent-needs-three-kinds-of-memory-not-one/) — frames memory as facts/lessons, session history, and knowledge-base retrieval rather than a single store.
- [walodayeet/hindsight-pi](https://github.com/walodayeet/hindsight-pi) — Hindsight-backed Pi memory extension with automatic recall, queued retention, scoped tags, and setup/status commands.
- [elpapi42/pi-observational-memory](https://github.com/elpapi42/pi-observational-memory) — Pi memory extension focused on observation/reflection logs that survive compaction.
- [chandra447/pi-hermes-memory](https://github.com/chandra447/pi-hermes-memory) — Pi memory suite with persistent memory, session search, failure learning, and procedural memory.

## Deferred

Auto recall, auto retain, session ingestion, richer bank/entity-label configuration, async operation polling, and external connectors are intentionally deferred.
