# Ingestion Patterns

Per-source patterns for Hindsight retains from Pi. Hindsight is accessed through Pi's MCP broker with tools scoped under the `hindsight` namespace. The shared rules below apply to every source; per-source sections only call out fetch tools, `document_id` shape, and non-obvious field values.

## Shared rules

- **Discover first.** Use `mcp_search` for `hindsight`, then `mcp_describe` the exact `hindsight.*` tool before calling it with `mcp_call`.
- **One document per source artifact.** Hindsight chunks server-side; don't pre-chunk into many small retains.
- **Strip chrome aggressively.** Drop navigation, breadcrumbs, footers, cookie banners, related posts, bot/system noise, license boilerplate, source-platform link wrappers, ephemeral dashboard query params, and zero-width / trailing whitespace.
- **Refresh by re-retaining** the same `document_id` with replace semantics such as `update_mode: "replace"` when the active schema supports it.
- **Set required classification** — `scope`, `source`, `origin`, `kind`, `document_id`, and at least one stable namespaced `tags` entry, either as first-class arguments or equivalent tags if required by the schema.
- **Do not retain secrets** — remove credentials, tokens, private keys, and `.env`-style assignments before calling Hindsight.

## Canonical retain shape

This is the policy shape every per-source pattern below produces. The exact JSON must match `mcp_describe` for the active `hindsight.*` tool.

```jsonc
{
  "name": "hindsight.retain",
  "arguments": {
    "content": "<substantive body>",
    "document_id": "<see per-source shape>",
    "scope": "repo",
    "source": "external",
    "origin": "jira",
    "kind": "semantic",
    "tags": ["repo:<base>", "ticket:abc-123", "topic:<area>"],
    "update_mode": "replace",
  },
}
```

For many sources, use a Hindsight batch retain tool if the broker exposes one, or the retain tool's `items` field when available. Keep a deterministic `document_id` per item and use replace semantics unless appending is intentional.

## Per-source patterns

### Jira tickets

- **Fetch.** Use the available Atlassian/Jira MCP broker tool.
- **`document_id`.** `ticket:<key>` (for example, `ticket:abc-123`).
- **Fields.** `scope: "repo"` if specific to the current repo, otherwise `global`; `source: "external"`; `origin: "jira"`; `kind: "semantic"`.
- **Tags.** `ticket:<key>`, `topic:<area>`, and `repo:<base>` when repo-scoped.
- **Content.** Summary, description, acceptance criteria, and decision-bearing comments.
- **Split only when** a ticket has independent constraints worth recalling separately — use `ticket:<key>:constraint:<slug>` sub-IDs.

### Confluence pages

- **Fetch.** Use the available Atlassian/Confluence MCP broker tool.
- **`document_id`.** `confluence:<space-key>:<page-id>` — use the page ID, not the title.
- **Fields.** Usually `scope: "global"`; `source: "external"`; `origin: "confluence"`; `kind: "semantic"` or `procedural` for runbooks.
- **Tags.** `topic:<area>` and `system:<name>` when applicable.
- **Split only when** the page is a large reference doc and recall needs section-level addressing — use `confluence:<space>:<page-id>:<anchor>` sub-IDs.

### GitHub repos / files / PRs / issues

- **Fetch.** Prefer broker-backed GitHub MCP tools for remote GitHub access. Use local files only for already-cloned workspace content.
- **`document_id`.** See the shape table in `tags-and-ids.md`. Default to the branch name; use a SHA only for point-in-time snapshots.
- **Fields.** `scope: "repo"` for current-repo work, otherwise `global`; `source: "external"`; `origin: "github"`; `kind: "semantic"` for code/docs or `episodic` for PR/issue history.
- **Tags.** `repo:<base>` when repo-scoped, `topic:<area>`, `tool:<name>` for tools/libraries, and `ticket:<key>` if referenced.
- **Content.** PRs: title, description, small diffs, and substantive review comments. Issues: title, body, and resolution comments. Files: the body.
- **For a whole repo**, retain the README plus a handful of high-signal files — not the whole tree.

### Web docs and blog posts

- **Fetch.** Use web fetch/search tools or browser automation for JS-rendered pages.
- **`document_id`.** `web:<host>:<slug>` — strip query strings and trailing slashes; replace `/` with `-` in slugs.
- **Fields.** `scope: "global"`; `source: "external"`; `origin: "web"` or `docs` for product/API docs; `kind: "semantic"`.
- **Tags.** `topic:<area>` and `tool:<name>` when applicable.
- **For multi-page docs sites**, retain each page as its own document.

### User statements ("remember that X")

- **`document_id`.** Anchor on topic, not timestamp: `preference:<name>`, `convention:<name>`, `repo:<repo>:convention:<slug>`, or `topic:<slug>`.
- **Fields.** `scope: "repo"` or `global`; `source: "manual"`; `origin: "user"`; `kind: "semantic"` or `procedural` for how-to instructions.
- **Tags.** A caller tag matching the document ID namespace, plus `repo:<base>` when repo-scoped.
- **Content.** Keep the user's phrasing; add brief context only when needed for future recall.
- **One document per discrete fact.** Three unrelated user statements → three documents.

### Agent observations

- **`document_id`.** `repo:<repo>:pattern:<slug>`, `repo:<repo>:convention:<slug>`, or `system:<name>:behavior:<slug>`.
- **Fields.** Usually `scope: "repo"`; `source: "agent"`; `origin: "chat"` or `github` if derived from code inspection; `kind: "semantic"` or `procedural`.
- **Tags.** `repo:<base>`, `topic:<area>`, `convention:<name>`, or `system:<name>` as applicable.
- **Only retain observations that are reusable across sessions, non-obvious from code, and likely stable.** Task-specific state belongs in plans, not memory.

### Episodic memories

- **`document_id`.** `session:<yyyy-mm-dd>:<short-slug>` or `incident:<id>` — every session/event is its own document. Don't reuse IDs across sessions.
- **Fields.** `source: "agent"`, `kind: "episodic"`, `origin: "chat"`, plus appropriate `scope`.
- **Tags.** `repo:<base>` when repo-scoped and a stable topic/system tag.

## Bulk ingestion

For many sources, use a `hindsight.*` batch retain tool if the broker exposes one. If the broker only exposes `hindsight.retain`, use its `items` field only when `mcp_describe` shows that batch input is supported. Call-level fields and tags should apply to every item; per-item tags should add source-specific labels.

```jsonc
{
  "name": "hindsight.retain",
  "arguments": {
    "scope": "global",
    "source": "external",
    "origin": "jira",
    "kind": "semantic",
    "tags": ["topic:q2-roadmap"],
    "update_mode": "replace",
    "items": [
      {
        "content": "...",
        "document_id": "ticket:abc-100",
        "tags": ["ticket:abc-100"],
      },
      {
        "content": "...",
        "document_id": "ticket:abc-101",
        "tags": ["ticket:abc-101"],
      },
    ],
  },
}
```

For very large bulk jobs, dispatch a subagent that fetches and retains in a loop and returns a summary.
