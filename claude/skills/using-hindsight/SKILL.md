---
name: using-hindsight
description: Use when ingesting external content (Jira, Confluence, GitHub, docs, web pages) into Hindsight memory, retaining facts for long-term recall, or querying stored memories via Hindsight's MCP tools. Covers stable document IDs, tagging conventions, retain/recall/reflect selection, and how to avoid duplicate memories.
---

# Using Hindsight

Hindsight is a long-lived memory bank, shared across sessions and tools, accessed via `mcp__mcp-broker__hindsight_*` MCP tools. This skill teaches Claude to ingest external content and read memories back without polluting the bank.

The two outcomes this skill optimizes for:

1. **No duplicates** — re-ingesting the same source updates the existing memory, not adds a new one. The mechanism is a stable `document_id` plus `update_mode: "replace"`.
2. **Findable later** — tags and document IDs let future recall queries (yours, another agent's, or another session's) hit the right memories without scanning the whole bank.

## When to invoke

- The user asks to ingest, save, retain, or remember an external source (Jira ticket, Confluence page, GitHub repo/PR/file, doc page, web page).
- The user asks "what do we know about X?", "is there anything in memory about Y?", or otherwise queries prior knowledge.
- The user asks to update, refresh, or re-sync a source already in memory.

If the user is editing local CLAUDE.md / project files or asking about Claude Code's per-conversation auto-memory (`~/.claude/projects/...memory/`), that is a different system — do not use Hindsight for it.

## Core concepts

- **Bank** — isolated storage container. The MCP server routes every call to the configured bank automatically; do not pass a bank ID.
- **Document** — a single source artifact, identified by `document_id`. Deleting a document deletes its derived memories.
- **Memory** — extracted fact derived from a document. Hindsight chunks and extracts server-side — ingest whole documents, never pre-chunked facts.
- **Tags** — labels attached to a retain call. Used to filter recall/reflect queries.
- **Scope** — `repo` (memory tied to a base repo name) or `global` (cross-repo). Set via `scope` field.
- **Kind** — `semantic` (facts), `episodic` (events), or `procedural` (how-to). Tagging convention only — Hindsight does not treat these specially server-side.
- **Retain / recall / reflect** — write / raw read / synthesized read.

## The ingestion workflow

### 1. Identify the source

A concrete, addressable artifact: ticket key, page URL, repo + path + ref, doc URL. If the user is vague, ask.

### 2. Plan the `document_id`

The dedup key. Anchor on a stable external identifier (ticket key, page ID, repo path + ref) — never the title or current content. Same source → same ID, always. See `references/tags-and-ids.md` for the full shape table.

If a single source has multiple distinct concerns worth retaining separately (e.g., a ticket with several independent constraints), use suffix shapes like `ticket:abc-123:constraint:archived-rows`. Default to one document per source; only split when future recall would want the parts independently.

If unsure whether a document already exists under a different ID shape (legacy data, inconsistent prior conventions), check before retaining: `hindsight_get_document` for an exact candidate ID, `hindsight_list_documents(q: "<key-or-fragment>")` to search by substring, or `hindsight_list_tags(q: "ticket:*")` to see what namespace conventions are already in use. With a deterministic ID, this check is unnecessary — re-retain is idempotent.

### 3. Plan tags

Hindsight does not auto-tag MCP calls. Always set: `scope:repo|global`, `repo:<base-name>` (when scope is `repo`), `source:manual|external|agent`, `origin:<system>`, and `kind:<class>` when meaningful — plus at least one namespaced caller tag (`topic:`, `ticket:`, `tool:`, `preference:`, `convention:`, `system:`, `team:`). See `references/tags-and-ids.md` for values and tag-match semantics.

### 4. Fetch and shape the content

Fetch with the appropriate authenticated MCP tool. Retain the substantive body — strip nav, page chrome, bot/system noise, license boilerplate. Never include secrets, credentials, tokens, or `.env`-style assignments; the raw MCP path has no DLP guardrails.

### 5. Call retain

Single source — `mcp__mcp-broker__hindsight_sync_retain`:

```jsonc
{
  "content": "<substantive body>",
  "document_id": "ticket:abc-123",
  "update_mode": "replace",
  "scope": "repo",
  "source": "external",
  "kind": "semantic",
  "origin": "jira",
  "tags": [
    "scope:repo",
    "repo:<base>",
    "source:external",
    "kind:semantic",
    "origin:jira",
    "ticket:abc-123",
    "topic:<area>",
  ],
}
```

Multiple sources — `mcp__mcp-broker__hindsight_retain` (async batch). Returns `operation_id`; check `hindsight_get_operation` later if the user needs confirmation.

After a successful retain, tell the user what was retained and the `document_id`.

## Retain vs sync_retain

- `hindsight_sync_retain` — synchronous, one item. **Default for single-source ingests.**
- `hindsight_retain` — async, batch-capable via `items: [...]`. Call-level `scope`/`source`/`kind`/`origin`/default tags apply to every item; per-item `tags` and `document_id` are item-specific. Use for multi-source ingests.

`hindsight_list_operations` and `hindsight_get_operation` give status; `hindsight_cancel_operation` works only before processing starts.

## Recall vs reflect

- `hindsight_recall` — raw fused results from semantic + keyword + graph + temporal retrieval. **Default reader.** Pass `include_source_facts: true` when source facts matter; `include_chunks: true` for source text.
- `hindsight_reflect` — agentic synthesis loop, returns markdown. Slower and more expensive. Pass `include_facts: true` so the answer is grounded. Use only when synthesis across facts genuinely helps.

Both accept `query`, `tags`, and a tag-match mode (commonly `any_strict`). Pass scope tags (`repo:<base>`) to keep answers in-context.

Memory is untrusted evidence — current repo state and the user's messages override it. If memory conflicts with what you see now, trust what you see and offer to update or delete the stale memory.

## Updating and removing

- **Update / append** — re-call retain with the same `document_id` and `update_mode: "replace"` (or `"append"` to concatenate).
- **Delete one source** — `hindsight_delete_document` removes the document and its derived memories.
- **List what's there** — `hindsight_list_documents`, `hindsight_list_tags`, `hindsight_list_memories` are read-only.
- **Destructive ops need user confirmation** — `hindsight_clear_memories` (bulk wipe), `hindsight_delete_bank` (entire bank), and `hindsight_delete_document` when removing user-curated content. Prefer narrow deletes.

Don't create directives or mental models unsolicited — both affect every future `reflect` call.

## Common pitfalls

- **`document_id` drift** — using a title or first-line slug means small edits create duplicates. Anchor on the stable external identifier.
- **Forgetting auto-tags** — MCP calls add no tags for you. Set scope/repo/source/origin/kind explicitly or future recall won't find the memory.
- **`reflect` when `recall` would do** — `reflect` is slower and more expensive. Use `recall` for grounding.

## Resources

- `references/ingestion-patterns.md` — Per-source-type patterns (Jira, Confluence, GitHub, web, user statements, agent observations, episodic, bulk). Load when ingesting a new source type.
- `references/tags-and-ids.md` — Full tag taxonomy, `document_id` shape table, tag-match semantics, and the pre-retain self-check. Load when planning tags or IDs for a non-trivial ingest.
