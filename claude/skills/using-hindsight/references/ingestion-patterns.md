# Ingestion Patterns

Per-source patterns for Hindsight retains. The shared rules below apply to every source; the per-source sections only call out the fetch tool, `document_id` shape, and non-obvious field values.

## Shared rules

- **One document per source artifact.** Hindsight chunks server-side; don't pre-chunk into many small retains.
- **Strip chrome.** Drop navigation, breadcrumbs, footers, cookie banners, "related posts", bot/system noise, license boilerplate. Keep the substantive body and decisions.
- **Refresh by re-retaining** the same `document_id` with `update_mode: "replace"`.
- **Auto tags are always required** — `scope:`, `repo:` (when scope is repo), `source:`, `origin:`, and `kind:` (when meaningful). See `tags-and-ids.md` for values.

## Canonical retain shape

This is the shape every per-source pattern below produces. Only the `document_id`, `scope`, `origin`, `source`, and caller tags vary.

```jsonc
{
  "content": "<substantive body>",
  "document_id": "<see per-source shape>",
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

## Per-source patterns

### Jira tickets

- **Fetch.** `atlassian_getJiraIssue` (one); `atlassian_searchJiraIssuesUsingJql` then iterate (many).
- **`document_id`.** `ticket:<key>` (e.g., `ticket:abc-123`).
- **Fields.** `scope: "repo"` (or `global` if cross-repo), `source: "external"`, `origin: "jira"`, `kind: "semantic"`. Caller tags: `ticket:<key>`, `topic:<area>`.
- **Content.** Summary, description, acceptance criteria, decision-bearing comments.
- **Split only when** a single ticket has independent constraints worth recalling separately — use `ticket:<key>:constraint:<slug>` sub-IDs.

### Confluence pages

- **Fetch.** `atlassian_getConfluencePage`; for a space, `atlassian_getPagesInConfluenceSpace` then iterate.
- **`document_id`.** `confluence:<space-key>:<page-id>` — use the page ID, not the title.
- **Fields.** `scope: "global"` (typical), `source: "external"`, `origin: "confluence"`. Caller tags: `topic:<area>`, `system:<name>` when applicable.
- **Split only when** the page is a large reference doc and recall needs to address sections independently — use `confluence:<space>:<page-id>:<anchor>` sub-IDs.

### GitHub repos / files / PRs / issues

- **Fetch.** `gh` via Bash or `mcp__mcp-broker__github_*`.
- **`document_id`.** See the shape table in `tags-and-ids.md`. Default to the branch name; use a SHA only for point-in-time snapshots.
- **Fields.** `scope: "global"` (or `repo` for current-repo work), `source: "external"`, `origin: "github"`. Caller tags: `topic:<area>`, `tool:<name>` for tools/libraries, `ticket:<key>` if the PR references a ticket.
- **Content.** PRs: title, description, diff if small (<400 lines), substantive review comments. Issues: title, body, resolution comments. Files: the body.
- **For a whole repo**, retain the README plus a handful of high-signal files — not the whole tree.

### Web docs and blog posts

- **Fetch.** `WebFetch`, or `playwright-cli` for JS-rendered pages.
- **`document_id`.** `web:<host>:<slug>` — strip query strings and trailing slashes; replace `/` with `-` in slugs.
- **Fields.** `scope: "global"`, `source: "external"`, `origin: "web"` (or `"docs"` for product/API docs). Caller tags: `topic:<area>`, `tool:<name>` when applicable.
- **For multi-page docs sites**, retain each page as its own document.

### User statements ("remember that X")

- **`document_id`.** Anchor on topic, not timestamp: `preference:<name>`, `convention:<name>`, `repo:<repo>:convention:<slug>`, or `topic:<slug>`.
- **Fields.** `scope: "repo"` (or `global`), `source: "manual"`, `origin: "user"`, `kind: "semantic"` (or `"procedural"` for how-to). Caller tag matches the document_id namespace.
- **Content.** Keep the user's phrasing; add brief context only when needed for future recall.
- **One document per discrete fact.** Three unrelated user statements → three documents.

### Agent observations

- **`document_id`.** `repo:<repo>:pattern:<slug>`, `repo:<repo>:convention:<slug>`, or `system:<name>:behavior:<slug>`.
- **Fields.** `scope: "repo"`, `source: "agent"`, `origin: "chat"` (or `"github"` if derived from code inspection).
- **Only retain observations that are reusable across sessions, non-obvious from the code, and likely stable.** Task-specific state belongs in plans, not memory.

### Episodic memories

- **`document_id`.** `session:<yyyy-mm-dd>:<short-slug>` or `incident:<id>` — every session/event is its own document. Don't reuse IDs across sessions.
- **Fields.** `source: "agent"`, `kind: "episodic"`, `origin: "chat"`.

## Bulk ingestion

For many sources in one call, use `hindsight_retain` (async, batch). Move shared values to call level; per-item fields stay per-item:

```jsonc
{
  "scope": "global",
  "source": "external",
  "kind": "semantic",
  "origin": "jira",
  "tags": [
    "scope:global",
    "source:external",
    "kind:semantic",
    "origin:jira",
    "topic:q2-roadmap",
  ],
  "items": [
    {
      "content": "...",
      "document_id": "ticket:abc-100",
      "update_mode": "replace",
      "tags": ["ticket:abc-100"],
    },
    {
      "content": "...",
      "document_id": "ticket:abc-101",
      "update_mode": "replace",
      "tags": ["ticket:abc-101"],
    },
  ],
}
```

For very large bulk jobs (50+ sources), dispatch a subagent that fetches and retains in a loop and returns a summary — keeps raw fetch output out of the main context.
