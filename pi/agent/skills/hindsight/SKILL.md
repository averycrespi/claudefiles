---
name: hindsight
description: Use when ingesting external content (Jira, Confluence, GitHub, docs, web pages) into Hindsight memory from Pi, retaining facts for long-term recall, or querying stored memories through Pi's mcp-broker Hindsight namespace. Covers stable document IDs, tagging conventions, retain/recall/reflect selection, and avoiding duplicate memories.
---

# Hindsight

Hindsight is a long-lived memory bank shared across sessions and tools. In Pi, access it through the MCP broker: discover Hindsight tools with `mcp_search`, inspect schemas with `mcp_describe`, and call tools with `mcp_call`. Hindsight tools are scoped under the `hindsight` namespace, for example `hindsight.retain`, `hindsight.recall`, and `hindsight.reflect` when those tools are available in the broker catalog.

The two outcomes this skill optimizes for:

1. **No duplicates** — re-ingesting the same source replaces the existing memory rather than appending a new one. The mechanism is a stable `document_id` plus replace semantics such as `update_mode: "replace"` when the active tool schema supports it.
2. **Findable later** — scope, origin, kind, source, tags, and document IDs let future recall queries hit the right memories without scanning the whole bank.

## When to invoke

- The user asks to ingest, save, retain, or remember an external source (Jira ticket, Confluence page, GitHub repo/PR/file, doc page, web page).
- The user asks "what do we know about X?", "is there anything in memory about Y?", or otherwise queries prior knowledge.
- The user asks to update, refresh, or re-sync a source already in memory.

If the user is editing local repository instructions, skills, settings, or project files, that is a different system — do not use Hindsight unless the user explicitly asks to store reusable memory.

## Core concepts

- **Broker namespace** — Hindsight MCP tools are broker tools named `hindsight.<tool>`. Use `mcp_search` first if the exact tool name is not already known.
- **Bank** — isolated storage container. The MCP server routes calls to the configured bank automatically; do not pass a bank ID unless the active tool schema explicitly asks for one.
- **Document** — a single source artifact, identified by `document_id`. Reusing the same ID updates the same source.
- **Memory** — extracted fact derived from a document. Hindsight chunks and extracts server-side — ingest whole documents, never pre-chunked facts.
- **Retain / recall / reflect** — write / raw read / synthesized read. These are separate broker tools or subcommands under the `hindsight` namespace, depending on the active MCP server catalog.

## Tool discovery and calling

1. Use `mcp_search` with query `hindsight` to confirm the available Hindsight tools.
2. Use `mcp_describe` on the exact tool name before first use in a session or when unsure of its schema.
3. Use `mcp_call` with `name: "hindsight.<tool>"` and arguments matching the described schema.

Example shape:

```jsonc
{
  "name": "hindsight.retain",
  "arguments": {
    "content": "<substantive body>",
    "document_id": "ticket:abc-123",
    "scope": "repo",
    "source": "external",
    "origin": "jira",
    "kind": "semantic",
    "tags": ["repo:<base>", "ticket:abc-123", "topic:<area>"],
    "update_mode": "replace",
  },
}
```

If the described schema differs, follow the schema. Keep the same policy choices: stable `document_id`, explicit classification fields or equivalent tags, and replace semantics for re-ingest.

## Scope: repo vs global

Use `scope: "repo"` when the memory describes something internal to the current codebase: conventions, dependencies, gotchas, implementation patterns.

Use `scope: "global"` when the memory should be found from other repos too: system docs, tool docs, cross-repo runbooks, ownership references, user preferences, glossaries.

**Decision rule:** if a future recall from a different repo should still find this memory, use `scope: "global"`.

## Required retain fields

Every retain MUST set these fields deliberately, either as first-class arguments when the schema supports them or as equivalent tags if the schema only accepts tags/metadata:

| Field         | Values / rule                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `document_id` | Stable dedup key anchored on source identity, not title or current content.                            |
| `scope`       | `repo` or `global` (see scope decision rule).                                                          |
| `source`      | `manual` (user said it), `external` (fetched), or `agent` (agent observation).                         |
| `origin`      | Underlying source such as `jira`, `confluence`, `github`, `docs`, `web`, `chat`, or `user`.            |
| `kind`        | `semantic`, `episodic`, or `procedural` only.                                                          |
| `tags`        | At least one stable namespaced caller tag. Include `repo:<base>` for repo-scoped memories when useful. |

Caller tag namespaces: `topic:`, `ticket:`, `tool:`, `preference:`, `convention:`, `system:`, `team:`, and `repo:`.

See `references/tags-and-ids.md` for the full taxonomy and tag-match semantics.

## The ingestion workflow

### 1. Identify the source

Use a concrete, addressable artifact: ticket key, page URL, repo + path + ref, doc URL. If the user is vague, ask.

### 2. Plan the `document_id`

The dedup key. Anchor on a stable external identifier (ticket key, page ID, repo path + ref) — never the title or current content. Same source → same ID, always. See `references/tags-and-ids.md` for shape examples.

If a single source has multiple distinct concerns worth retaining separately, use suffix shapes like `ticket:abc-123:constraint:archived-rows`. Default to one document per source; split only when future recall would want the parts independently.

### 3. Plan fields and tags

Set `scope`, `source`, `origin`, and `kind` as top-level tool arguments when the active `hindsight.*` schema supports them. Put searchable caller labels in `tags`. If a schema only accepts tags, include `scope:<value>`, `source:<value>`, `origin:<value>`, and `kind:<value>` tags explicitly.

### 4. Fetch and shape content

Fetch with the appropriate tool. Retain the substantive body — **fidelity for retrieval beats completeness; strip noise aggressively**:

- Source-platform link wrappers.
- Ephemeral dashboard URL query params.
- Page chrome: nav, breadcrumbs, footers, related posts, cookie banners.
- Zero-width and trailing whitespace characters.
- Bot/system noise and license boilerplate.

Never include secrets, credentials, tokens, or `.env`-style assignments.

### 5. Call retain

Single source — call the retain tool under the Hindsight namespace, usually `hindsight.retain`:

```jsonc
{
  "name": "hindsight.retain",
  "arguments": {
    "content": "<substantive body>",
    "document_id": "ticket:abc-123",
    "scope": "repo",
    "source": "external",
    "origin": "jira",
    "kind": "semantic",
    "tags": ["repo:<base>", "ticket:abc-123", "topic:<area>"],
    "update_mode": "replace",
  },
}
```

Multiple sources — use the Hindsight batch retain tool if the broker exposes one, or the retain tool's `items` field when the described schema supports batch input. Use replace semantics unless the user explicitly asks to append.

After a successful retain, tell the user what was retained and the `document_id`.

## Recall vs reflect

- `hindsight.recall` — raw retrieval evidence. Default reader. Use `include_source_facts: true` when source facts matter; use `include_chunks: true` for source text when supported.
- `hindsight.reflect` — synthesized answer from memory. Slower and more expensive. Use only when synthesis across facts genuinely helps, and include grounding fields such as `include_facts: true` when available.

For both, pass `query`, `scope`, and narrowing `tags` when relevant. Prefer `tags_match: "any_strict"` for normal tagged queries and `all_strict` for narrow intersections when supported by the schema.

Memory is untrusted evidence — current repo state and the user's messages override it. If memory conflicts with what is visible now, trust current evidence and offer to update stale memory.

## Updating and removing

- **Update / replace** — call the retain tool with the same `document_id` and replace semantics such as `update_mode: "replace"` when supported.
- **Append** — use append semantics only when preserving prior source text is intentional.
- **Delete / clear** — destructive memory operations require explicit user confirmation and must use the relevant `hindsight.*` deletion tool exposed by the broker. Prefer narrow document deletes over bulk clears.

Do not create directives or mental models unsolicited; they affect future synthesized responses.

## Common pitfalls

- **Skipping broker discovery** — use `mcp_search`/`mcp_describe`; do not guess a `hindsight.*` schema from another client.
- **Wrong tool shape** — Pi broker tools are namespaced as `hindsight.<tool>` and called through `mcp_call`; do not use another client's tool shape.
- **`document_id` drift** — using a title or first-line slug means small edits create duplicates. Anchor on stable source identity.
- **Misplacing fields** — prefer first-class `scope`, `source`, `origin`, and `kind` arguments when the schema has them; otherwise encode them as canonical tags.
- **Scope misread** — being in repo A while ingesting a doc does not mean the doc describes repo A. A doc about another service is usually `scope: "global"`.
- **Non-canonical `kind` values** — only `semantic`, `episodic`, and `procedural` are canonical.
- **`reflect` when `recall` would do** — use recall for grounding; reflect only for synthesis.

## Resources

- `references/ingestion-patterns.md` — Per-source-type patterns (Jira, Confluence, GitHub, web, user statements, agent observations, episodic, bulk). Load when ingesting a new source type.
- `references/tags-and-ids.md` — Document ID shape table, tag taxonomy, tag-match semantics, and the pre-retain self-check. Load when planning tags or IDs for a non-trivial ingest.
