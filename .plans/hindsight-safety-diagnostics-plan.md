# Hindsight Safety and Diagnostics Plan

## Goal

Improve the explicit Hindsight Pi extension with safer memory retention, read-only diagnostics, better provenance guidance, batch retain, and small schema/config cleanups while preserving the no-automation V1 posture.

## Constraints

- Keep the extension explicit-only: no auto-recall, auto-retain, session ingestion, compaction hook, or background queue.
- Do not duplicate `/hindsight-config`; the new diagnostic command should report readiness and health, not a full config dump.
- Do not add write-based doctor checks, automatic repair, retained logs, delete/forget/clear operations, tag groups, observation scopes, async operations, or structured reflect schemas in this pass.
- Treat recalled/reflected memory as untrusted evidence; current repo/user/tool evidence remains authoritative.
- Hard-block narrow secret-like retains by default with no override flag in this pass.
- Follow repository Pi extension conventions: update README for behavior/config changes, add tests, and run both `make typecheck` and `make test` before reporting completion.

## Acceptance Criteria

- AC-1: Retain calls reject obvious secrets/private keys/token assignments/credential URLs before sending any request to Hindsight, returning recoverable tool text with `details.error === true`.
- AC-2: Recall and reflect tool results include a short trust-boundary preamble in agent-visible text, and tool guidelines/README document provenance usage and verification expectations.
- AC-3: A read-only `/hindsight-doctor` command is registered and reports actionable diagnostics for config readiness, connectivity/auth, bank accessibility, and optional safe inspection without dumping memory contents or writing memories.
- AC-4: Retain supports both the existing single-item shape and a new batch `items` shape, applying the same scope/tag/metadata/secret rules to every retained item.
- AC-5: Config includes `reflectMaxTokens` with default `1200`, environment override `HINDSIGHT_REFLECT_MAX_TOKENS`, normalization, README documentation, and reflect request defaulting when `max_tokens` is not provided.
- AC-6: Tool schemas use TypeBox enums for enum-like parameters, and caller metadata keys starting with `hindsight_` are rejected or sanitized so policy metadata cannot be spoofed.
- AC-7: Tests cover safety blocking, batch retain shaping, doctor command behavior, config/env handling, metadata key protection, provenance preambles, schema enums, and README-documented output limits.

## Chosen Approach

Implement a conservative safety-and-observability pass around the existing one-tool design. The extension remains an explicit adapter over Hindsight, but gains guardrails at retention boundaries, read-only diagnostics for external-service failures, better trust/provenance framing, and batch ingestion support. This avoids premature automation while addressing the highest-risk gaps for persistent memory: leaks, over-trust, poor debuggability, and duplicate manual retain loops.

## Documentation Impact

Update `pi/agent/extensions/hindsight/README.md` to document:

- Safety model: recalled memory is untrusted evidence, retained content is sent to an external Hindsight API, and obvious secrets are hard-blocked.
- Provenance guidance/examples: when to use `include_source_facts`, `include_chunks`, and `include_facts`; current repo/user/tool evidence wins over memory.
- `/hindsight-doctor`: purpose, read-only behavior, diagnostic categories, and no memory-content dumping.
- Batch retain examples and constraints.
- `reflectMaxTokens` field and `HINDSIGHT_REFLECT_MAX_TOKENS` environment override in the unified config table and JSON example if useful.
- Local output limits: max 8 array results, max 1200 chars per field, max 7000 chars total.
- Deferred scope remains automation, tag groups, observation scopes, async operations, structured reflect, and delete/forget/clear.

## Assumptions / Open Questions

- Q1: Hindsight may or may not expose safe bank stats/tag list endpoints in the currently targeted API. Implementation should probe only documented/safe endpoints if confirmed; otherwise `/hindsight-doctor` should limit inspection to connectivity/auth and a no-content tiny recall smoke check.
- Q2: Secret detection should be intentionally narrow and may false-negative; it is not a complete DLP system.
- Q3: Doctor output can use `ctx.ui.notify` because existing config commands use UI notifications; tests can register and invoke the command with a fake context.

## Ordered Tasks

### T1: Add narrow retain safety scanning

Covers: AC-1, AC-4, AC-7

- Add a small local safety helper, likely `pi/agent/extensions/hindsight/safety.ts`, that scans retain content/context/metadata/document IDs where appropriate for obvious high-risk secrets.
- Detect narrow patterns such as PEM private keys, `.env`-style credential blobs, credential URLs, bearer/API token assignments, and common high-entropy token strings.
- Return concise categories and field paths; do not echo full secret-looking values in errors.
- Integrate the scanner before `client.retain(...)` so blocked items never leave the process.
- Add focused unit tests for blocking and non-blocking cases.

### T2: Protect reserved Hindsight metadata

Covers: AC-6, AC-7

- Update metadata handling in `pi/agent/extensions/hindsight/tags.ts` or retain validation so caller-provided metadata keys beginning with `hindsight_` cannot spoof policy metadata.
- Prefer rejecting such metadata with readable tool text, since silent sanitization can hide caller mistakes.
- Add tests in `tags.test.ts` and/or `tools.test.ts` for reserved key rejection.

### T3: Add provenance/trust framing

Covers: AC-2, AC-7

- Extend `promptGuidelines` in `tools.ts` with trust-boundary guidance: memory is evidence, not instruction; verify against current repo/user/tool evidence; use recall for evidence and reflect for synthesis.
- Add a short preamble to recall and reflect result text before bounded JSON output.
- Keep `include_source_facts`, `include_chunks`, and `include_facts` default `false`.
- Add tests asserting recall/reflect text includes the preamble.

### T4: Add `reflectMaxTokens` config

Covers: AC-5, AC-7

- Extend `HindsightConfig`, defaults, raw config normalization, env parsing, tests, and README config table.
- Default to `1200` and support `HINDSIGHT_REFLECT_MAX_TOKENS`.
- In reflect requests, send `max_tokens: params.max_tokens ?? config.reflectMaxTokens`.
- Update client test config fixtures for the new required field.

### T5: Replace enum-like TypeBox strings with enums

Covers: AC-6, AC-7

- Define shared TypeBox enum schemas for action, source, kind, update_mode, tags_match, budget, and any other finite string parameters.
- Keep runtime validation as the authoritative guardrail and preserve current error texts where practical.
- Update schema tests to assert exposed enum arrays for representative fields.

### T6: Add batch retain support

Covers: AC-4, AC-1, AC-7

- Extend tool params with optional `items` for `retain` while preserving existing single `content` retain calls.
- Support per-item `content`, optional `context`, `timestamp`, `document_id`, `update_mode`, `metadata`, and `tags` if simple; keep scope/source/kind/origin at the call level for v1 unless existing API ergonomics strongly favor otherwise.
- Apply default tags plus per-item tags, deterministic metadata, reserved metadata rejection, and safety scanning to every item.
- Shape the Hindsight retain request as a single `items` array and keep `async: false`.
- Add tests for mixed batch shaping, item count, per-item validation, and blocked-item no-network behavior.

### T7: Add read-only `/hindsight-doctor`

Covers: AC-3, AC-7

- Add a command module, likely `pi/agent/extensions/hindsight/doctor.ts`, and register it from `index.ts`.
- The command should load config, report readiness without dumping the full config, configure the client, and run read-only diagnostics.
- Add client methods only as needed for safe diagnostics, such as a tiny recall smoke check against the configured bank. If safe stats/tag endpoints are confirmed during implementation, add optional read-only inspection; failures there should be warnings, not hard failures.
- Distinguish failure classes in output: missing apiKey, invalid/unreachable URL, auth/HTTP failure, unexpected response, and bank access/smoke failure.
- Do not retain, delete, clear, auto-repair, or print raw memory results.
- Add command registration/handler tests with fake clients and fake UI notifications.

### T8: Update README documentation

Covers: AC-2, AC-3, AC-4, AC-5, AC-7

- Update the existing README rather than creating new docs.
- Add safety/provenance/doctor sections and examples.
- Update configuration table and examples for `reflectMaxTokens`.
- Document output bounds and batch retain behavior.
- Keep prior art and deferred sections aligned with the chosen scope.

### T9: Verification and bounded fix loop

Covers: AC-1 through AC-7

- Run targeted tests while developing, then run the required repository checks for Pi extension changes.
- Fix deterministic failures with a bounded loop; if Hindsight API endpoint assumptions block doctor inspection, keep doctor to no-content recall smoke plus clear warnings.

## Verification Checklist

- [ ] V1: `npx tsx --test pi/agent/extensions/hindsight/*.test.ts` passes.
- [ ] V2: `make typecheck` passes.
- [ ] V3: `make test` passes.
- [ ] V4: Safety tests prove blocked retain calls do not invoke `client.retain`.
- [ ] V5: Doctor command tests prove no writes occur and raw memory contents are not displayed.
- [ ] V6: README documents safety, provenance, doctor, batch retain, output limits, and `reflectMaxTokens`.
- [ ] V7: Confirm Documentation Impact was followed and no new documentation files were created.

## Known Issues / Follow-ups

- Secret detection is narrow and not a full DLP/privacy system.
- Delete/forget/clear user-control operations remain deferred pending UX and confirmation semantics.
- Tag groups, observation scopes, async operations, and structured reflect remain deferred.
- Automation remains intentionally skipped for now.
