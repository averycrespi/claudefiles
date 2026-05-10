# Hindsight Pi Extension Plan

## Goal

Build a Pi extension that gives the agent explicit, inspectable read/write access to Hindsight memory while relying on Hindsight for extraction, hybrid retrieval, observations, and synthesis.

## Constraints

- Implement as a directory-based Pi extension under `pi/agent/extensions/hindsight/`.
- Do not create a local memory database or custom semantic extraction pipeline; Hindsight owns memory extraction, retrieval, observations, and reflect synthesis.
- V1 is explicit-first: no automatic recall, no automatic retain, and no session-ingest workflow.
- Use exactly one configured Hindsight bank plus deterministic tags for scoping; do not create per-repo banks or allow per-call bank overrides in v1.
- External-source ingestion means retaining text the agent already has; do not build URL, MCP, file, or service-specific connector logic in this extension.
- Subagents do not receive memory automatically and do not write memories directly by default. The main agent may explicitly recall memory and include bounded results in a subagent prompt.
- Follow repo conventions: shared config helper, masked `/hindsight-config`, no `console.*` in TUI paths, README documents config/logging, TypeBox schemas use snake_case for agent-facing fields, and tests import `.ts` files.

## Acceptance Criteria

- AC-1: Pi loads a new `hindsight` extension directory and registers a single agent-facing `hindsight` tool with explicit `retain`, `recall`, and `reflect` actions.
- AC-2: The extension reads config from Pi settings and environment overrides, masks `apiKey` in `/hindsight-config`, and blocks network calls with agent-readable errors when required settings (`apiKey`, `bankId`) are missing or invalid.
- AC-3: `retain` sends text content to Hindsight with deterministic scope/source/kind/repo tags, metadata, optional caller tags, and idempotent `document_id` support when provided.
- AC-4: `recall` queries Hindsight and returns locally bounded, structured raw facts with provenance fields useful to the agent; oversized fake responses are truncated predictably in tests.
- AC-5: `reflect` queries Hindsight and returns a synthesized response plus grounding/citation data according to the pinned Hindsight API contract; if the pinned API cannot provide grounding data, the implementation documents and tests the omission.
- AC-6: Repo-scope tagging derives `repo:<base-repo-name>` from Git metadata, including worktrees where the tag uses the base repository name rather than the worktree directory name; non-Git directories fall back to `basename(ctx.cwd)`.
- AC-7: Tests cover config precedence/validation, tag normalization, worktree-aware repo-name derivation, tool input validation, and Hindsight client request shaping without requiring a live Hindsight server.

## Chosen Approach

Use a small TypeScript extension with a single multi-action `hindsight` tool, a thin Hindsight HTTP client, deterministic tag construction, and minimal commands for config/status diagnostics. This keeps the model prompt compact and avoids overbuilding around features Hindsight already provides: retain extraction, recall search, observations, and reflect reasoning.

## Pinned Hindsight API Contract

Pin v1 implementation to the public Hindsight HTTP API OpenAPI spec version `0.6.1` from `https://hindsight.vectorize.io/openapi.json`, cross-checked against the generated TypeScript client in `vectorize-io/hindsight`.

Core routes:

- Health/status:
  - `GET /health`
  - `GET /version` returns `api_version` and feature flags.
- Retain:
  - `POST /v1/default/banks/{bank_id}/memories`
  - Body: `{ "items": MemoryItem[], "async"?: boolean }`.
  - `MemoryItem`: `content` required; optional `timestamp`, `context`, `metadata`, `document_id`, `entities`, `tags`, `observation_scopes`, `strategy`, `update_mode`.
  - Response: `success`, `bank_id`, `items_count`, `async`, optional `operation_id` / `operation_ids`, optional `usage`.
  - Note: older docs/control-plane comments mention `/memories/retain`; current OpenAPI/client route is `/memories`.
- Recall:
  - `POST /v1/default/banks/{bank_id}/memories/recall`
  - Body: `query` required; optional `types`, `budget`, `max_tokens`, `trace`, `query_timestamp`, `include`, `tags`, `tags_match`, `tag_groups`.
  - `include`: optional `entities`, `chunks`, `source_facts` objects; omit/`null` disables each include according to API semantics.
  - Response: `results[]`, optional `trace`, `entities`, `chunks`, `source_facts`. Each result includes `id`, `text`, and optional `type`, `entities`, `context`, `occurred_start`, `occurred_end`, `mentioned_at`, `document_id`, `metadata`, `chunk_id`, `tags`, `source_fact_ids`.
- Reflect:
  - `POST /v1/default/banks/{bank_id}/reflect`
  - Body: `query` required; optional `budget`, deprecated `context`, `max_tokens`, `include`, `response_schema`, `tags`, `tags_match`, `tag_groups`, `fact_types`, `exclude_mental_models`, `exclude_mental_model_ids`.
  - `include`: optional `facts` and `tool_calls` objects.
  - Response: `text`, optional `based_on`, `structured_output`, `usage`, `trace`.
- Tags/status helpers if needed:
  - `GET /v1/default/banks/{bank_id}/tags`
  - `GET /v1/default/banks/{bank_id}/stats`

Implementation should percent-encode `bank_id` when interpolating path segments and send `Authorization: Bearer <apiKey>`.

## Documentation Impact

Execution should create `pi/agent/extensions/hindsight/README.md` documenting:

- What the extension does and does not do in v1.
- The single `hindsight` tool, actions, parameters, and examples.
- Config table with settings fields, defaults, environment overrides, and masked sensitive fields.
- Tagging/scoping rules, including Git worktree repo-name behavior.
- Subagent memory policy: no automatic memory access; pass recalled facts explicitly.
- Logging behavior. If no retained logs are written, say so explicitly.
- Deferred v2 items: auto recall, auto retain, session ingestion, richer bank/entity-label configuration, async operations polling.

Verification must confirm this documentation exists and matches implemented behavior.

## Assumptions / Open Questions

- Q1: `list_tags` and richer status/doctor actions are optional in v1; the pinned API contract exposes `GET /v1/default/banks/{bank_id}/tags` and `GET /v1/default/banks/{bank_id}/stats`, but the plan does not require tool actions for them.
- Q2: Default tag match should be `any_strict` for scoped recall so untagged memories do not leak into scoped results unless the caller explicitly changes matching.

## Ordered Tasks

### T1: Inspect Hindsight OpenAPI and finalize client contract

Covers: AC-3, AC-4, AC-5

- Use the Pinned Hindsight API Contract section as the route/payload source unless implementation discovers the target server reports an incompatible `/version` or OpenAPI shape.
- Define a minimal internal client interface for `retain`, `recall`, and `reflect` from that pinned contract.
- Keep auth as bearer token from config; missing `apiKey` or `bankId` should produce agent-readable tool errors before network calls.
- Implement URL construction with `encodeURIComponent(bankId)` for path interpolation.

### T2: Create extension structure and config module

Covers: AC-1, AC-2

- Add `pi/agent/extensions/hindsight/index.ts` plus supporting modules such as `config.ts`, `client.ts`, `tags.ts`, and `tools.ts` as needed.
- Use `pi/agent/extensions/_shared/config.ts` helpers for settings/env merge and `/hindsight-config` registration.
- Config fields:
  - `baseUrl`, default `http://localhost:8888`, env `HINDSIGHT_BASE_URL`
  - `apiKey`, default unset, env `HINDSIGHT_API_KEY`, sensitive
  - `bankId`, default unset, env `HINDSIGHT_BANK_ID`
  - `defaultScope`, default `repo`, env `HINDSIGHT_DEFAULT_SCOPE`
  - `defaultTags`, default `[]`, env `HINDSIGHT_DEFAULT_TAGS`
  - `recallMaxTokens`, default `1200`, env `HINDSIGHT_RECALL_MAX_TOKENS`
  - `recallBudget`, default `mid`, env `HINDSIGHT_RECALL_BUDGET`
  - `reflectBudget`, default `low`, env `HINDSIGHT_REFLECT_BUDGET`
  - `tagsMatch`, default `any_strict`, env `HINDSIGHT_TAGS_MATCH`
- Config contract:
  - `apiKey` and `bankId` are required for networked tool actions.
  - Valid scopes: `repo`, `global`.
  - Valid sources: `manual`, `external`, `agent`.
  - Valid kinds: `semantic`, `episodic`, `procedural`.
  - Valid budgets: `low`, `mid`, `high`.
  - Valid tag matching modes: `any`, `any_strict`, `all`, `all_strict`.
  - `defaultTags` env parsing uses comma-separated tags; empty entries are ignored.
  - Invalid optional config values fall back to defaults; invalid required values remain unset and cause pre-network tool errors.
- Do not add config for repo path hashing, per-call bank overrides, or disabling reflect.

### T3: Implement deterministic tag and metadata construction

Covers: AC-3, AC-6

- Implement tag normalization with stable lowercase, safe separators, and predictable prefix handling.
- System tags should include scope/source/kind/repo where applicable:
  - `scope:global` or `scope:repo`
  - `repo:<base-repo-name>` for repo scope
  - `source:<manual|external|agent>`
  - optional `kind:<semantic|episodic|procedural>` when supplied
- Include equivalent provenance in metadata where useful.
- Derive repo name by walking upward from `ctx.cwd`:
  - `.git` directory: use basename of the directory containing `.git`.
  - `.git` file: parse `gitdir:`, resolve relative paths, read `commondir` if present, resolve the common Git dir, and use the parent basename when the common dir is `.git`; this makes worktrees tag as the base repository.
  - fallback: `basename(ctx.cwd)`.

### T4: Register the single `hindsight` tool

Covers: AC-1, AC-3, AC-4, AC-5

- Use a TypeBox schema with `action` and action-specific optional fields.
- Supported v1 actions:
  - `retain`: requires `content`; optional `context`, `scope`, `source`, `kind`, `tags`, `metadata`, `document_id`, `timestamp`, `update_mode`.
  - `recall`: requires `query`; optional `scope`, `tags`, `tags_match`, `types`, `max_tokens`, `budget`, `trace`, `query_timestamp`, `include_entities`, `include_chunks`, `include_source_facts`.
  - `reflect`: requires `query`; optional `scope`, `tags`, `tags_match`, `budget`, `max_tokens`, `include_facts`, `include_tool_calls`, `fact_types`, `exclude_mental_models`.
- Do not expose `bank_id`; all actions use configured `bankId`.
- Validate action requirements and return agent-readable error text for recoverable input errors.
- Enforce local output bounds independent of server `max_tokens`: cap result count, per-field character length, and total returned characters; mark truncation in text and details.
- Render compact tool calls/results using shared render helpers where useful.
- Tool guidance should prefer `recall` for raw evidence and `reflect` for synthesis.

### T5: Add commands and diagnostics

Covers: AC-2, AC-5

- Register `/hindsight-config` via the shared config command with `apiKey` masked.
- Add `/hindsight-status` or `/hindsight-doctor` only if it can be implemented simply from health/config checks without broad diagnostics.
- Do not add auto recall, auto retain, or session ingestion commands in v1.

### T6: Document the extension

Covers: AC-1 through AC-7

- Add `README.md` following repo extension documentation conventions.
- Include examples for retaining an explicit external-source text snippet gathered by other tools.
- Explain recall vs reflect:
  - `recall` returns raw facts and provenance for agent-side reasoning.
  - `reflect` returns Hindsight-synthesized answers from an agentic memory loop.
- Explain subagent policy and deferred automation.

### T7: Add tests

Covers: AC-2, AC-3, AC-6, AC-7

- Add unit tests for config parsing/precedence, env parsing, and sensitive masking where extension-specific behavior exists.
- Add tag tests for normalization, scope/source/kind merging, default tags, and user tags.
- Add repo-name tests using temporary directories that model normal repos, Git worktrees with `.git` files and `commondir`, and non-Git fallbacks.
- Add client/tool tests that stub `fetch` or wrap it in an exported holder to assert request paths, auth headers, request bodies, and error handling without a live server.
- Add explicit action validation tests for unknown actions, missing required fields per action, invalid enum values, malformed `metadata`/`tags`, missing required config, and recoverable errors returned as text instead of thrown exceptions.
- Add oversized fake response tests for local recall/reflect output bounds and truncation markers.

## Verification Checklist

- [ ] V1: Run `npm run lint`.
- [ ] V2: Run `npm run format:check`.
- [ ] V3: Run `make typecheck`.
- [ ] V4: Run `make test`.
- [ ] V5: If a local Hindsight server is available, run a bounded manual smoke test for `retain`, `recall`, and `reflect` against `http://localhost:8888` using a test bank/tag.
- [ ] V6: Confirm `/hindsight-config` masks `apiKey` and shows effective config.
- [ ] V7: Confirm worktree fixture tests prove base-repo tagging rather than worktree-directory tagging.
- [ ] V8: Confirm Documentation Impact was followed and README matches implemented config/tool behavior.

## Known Issues / Follow-ups

- Auto recall is deferred to v2.
- Auto retain is deferred to v2.
- Explicit session ingestion is deferred to v2.
- Hindsight bank configuration, entity labels, and observation mission management are deferred unless implementation discovers a very small safe path.
- External connectors are intentionally out of scope; the agent should gather text through existing Pi tools and then retain that text.
