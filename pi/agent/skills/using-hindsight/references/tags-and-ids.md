# Tags and Document IDs

Reference for planning `document_id` values and tags for Hindsight retains from Pi. Hindsight is accessed through Pi's MCP broker with tools scoped under the `hindsight` namespace. The goal is consistent deduplication and findable recall.

## Document ID shapes

`document_id` is the dedup key. Re-retaining with the same `document_id` and replace semantics updates the existing source instead of creating a duplicate. Omitting `document_id` can create random-ID duplicates.

Rules:

- Lowercase. Separator `:`. No spaces. No leading/trailing punctuation.
- Anchor on a **stable external identifier** (ticket key, page ID, repo + path + ref), not the title or current content.
- Same source → same ID, always.

| Source type               | Document ID shape                            | Example                                               |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| Jira ticket               | `ticket:<key>`                               | `ticket:abc-123`                                      |
| Jira ticket sub-fact      | `ticket:<key>:<facet>:<slug>`                | `ticket:abc-123:constraint:archived-rows`             |
| Confluence page           | `confluence:<space-key>:<page-id>`           | `confluence:eng:1234567890`                           |
| Confluence section        | `confluence:<space-key>:<page-id>:<heading>` | `confluence:eng:1234567890:rollback-plan`             |
| GitHub repo (root README) | `github:<owner>/<repo>@<ref>`                | `github:acme/widgets@main`                            |
| GitHub file               | `github:<owner>/<repo>:<path>@<ref>`         | `github:acme/widgets:src/auth/session.ts@main`        |
| GitHub PR                 | `github:<owner>/<repo>:pr-<num>`             | `github:acme/widgets:pr-482`                          |
| GitHub issue              | `github:<owner>/<repo>:issue-<num>`          | `github:acme/widgets:issue-119`                       |
| Web doc                   | `web:<host>:<slug>`                          | `web:hindsight.vectorize.io:developer-api-quickstart` |
| Repo-local convention     | `repo:<repo>:convention:<slug>`              | `repo:agent-config:convention:stow-editing`           |
| Topic note (cross-repo)   | `topic:<slug>`                               | `topic:memory-best-practices`                         |
| User preference           | `preference:<name>`                          | `preference:user-name`                                |
| Episodic session          | `session:<yyyy-mm-dd>:<short-slug>`          | `session:2026-05-12:hindsight-skill-design`           |

Notes:

- For GitHub refs, prefer the default branch name over a SHA unless the user wants a point-in-time snapshot. SHA-anchored IDs guarantee no future re-ingest will update them.
- For long heading slugs, pick the stable anchor ID over visible heading text when available.
- If no stable identifier exists, use a short content-hash suffix: `web:user-paste:<sha256-prefix>`.

## When to split a source into multiple documents

Default to **one document per source artifact**. Split only when:

- A single ticket or page covers multiple genuinely independent facts that future recall would want individually.
- The source is a large reference doc where section-level recall is more useful than one large source.

When splitting, use suffix shapes (`ticket:abc-123:constraint:archived-rows`) so all sub-documents share a recognizable prefix.

## Required classification

Prefer first-class fields when the active `hindsight.*` schema supports them. If a schema only accepts tags or metadata, encode the same values as stable canonical tags.

| Concept  | Values / rule                                                                                        | Tag fallback example |
| -------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| `scope`  | `repo` for current-repo knowledge; `global` for cross-repo knowledge.                                | `scope:repo`         |
| `source` | `manual` (user said it), `external` (fetched), or `agent` (agent observation).                       | `source:external`    |
| `kind`   | `semantic`, `episodic`, or `procedural` — no other values.                                           | `kind:semantic`      |
| `origin` | Underlying information source such as `jira`, `confluence`, `github`, `docs`, `web`, `chat`, `user`. | `origin:jira`        |

`kind` values:

- `semantic` — facts, definitions, constraints, conventions.
- `episodic` — events, sessions, what-happened-when.
- `procedural` — how-to instructions, runbooks, recipes.

Map non-canonical content labels (`reference`, `runbook`, `design`, `meeting-notes`) into one of the three canonical values. If unsure, default to `semantic`.

## Caller tags

Tags are searchable labels. Use stable namespaced tags instead of ad-hoc phrases.

| Tag pattern         | Use for                    | Example                   |
| ------------------- | -------------------------- | ------------------------- |
| `repo:<base-name>`  | Current repository         | `repo:agent-config`       |
| `topic:<slug>`      | Broad subject area         | `topic:repo-conventions`  |
| `ticket:<key>`      | Issue tracker identifier   | `ticket:abc-123`          |
| `tool:<name>`       | Tools or systems           | `tool:stow`               |
| `preference:<name>` | User preferences           | `preference:user-name`    |
| `convention:<name>` | Working conventions        | `convention:stow-editing` |
| `system:<name>`     | Named subsystem or service | `system:auth-service`     |
| `team:<name>`       | Team or org unit           | `team:platform`           |

Include at least one caller tag. For `scope: "repo"`, include `repo:<base-name>` when it helps future filtering.

### Tags to avoid

- Free-form tags with spaces, punctuation, or sentence fragments.
- Tags that duplicate `document_id` segments without improving search.
- Boolean tags like `important` or `urgent`.
- Date stamps as tags; use `document_id` for time-anchored memories.

## Tag-match semantics

Recall and reflect can filter by `tags` using match modes:

| Mode         | Match rule                          | Untagged memories |
| ------------ | ----------------------------------- | ----------------- |
| `any`        | Memory has ≥1 of the specified tags | Included          |
| `any_strict` | Memory has ≥1 of the specified tags | **Excluded**      |
| `all`        | Memory has every specified tag      | Included          |
| `all_strict` | Memory has every specified tag      | **Excluded**      |

When to use each:

- **`any_strict`** — normal scoped queries where tagged, on-topic results are desired.
- **`all_strict`** — narrow intersections (for example, `repo:foo` AND `ticket:abc-123`).
- **`any`** — broaden results by including untagged general memories.
- **`all`** — rare; use only when strict intersection plus untagged general memories is intentional.

A consequence of `any_strict` being the typical default: untagged retains are effectively invisible. Always tag retains.

## Self-check before retaining

Before calling a Hindsight retain tool through `mcp_call`, verify:

1. The exact `hindsight.*` tool has been found with `mcp_search` or is already known from the active catalog.
2. The tool schema has been inspected with `mcp_describe` when there is any uncertainty.
3. `document_id` is anchored on stable source identity, not title or current content.
4. `scope` is correct: if recall from another repo should find it, use `global`.
5. `source`, `origin`, and `kind` are set as top-level fields when supported, or as canonical tags otherwise.
6. `kind` is one of `semantic`, `episodic`, or `procedural`.
7. `tags` contains at least one stable namespaced caller tag; include `repo:<base>` for repo-scoped memories when useful.
8. Replace semantics are used unless appending is intentional.
9. Content contains no secrets, tokens, credentials, or `.env`-style assignments.
