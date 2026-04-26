# MCP Broker Spillover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Spill `mcp_call` results larger than 25K characters to a temp file and return a short envelope (path + size + 2 KB preview) instead of dumping the full payload into the agent's context.

**Architecture:** Add a small `spillover.ts` module inside `pi/agent/extensions/mcp-broker/` with the pure logic (joining text blocks, deciding to spill, building the envelope) and the IO function that writes the file. Wire it into `mcp_call.execute` in `tools.ts` immediately before each `return` site so failures cleanly fall back to inline content. No changes to other extensions or to Pi core.

**Tech Stack:** TypeScript, Node `node:fs/promises` and `node:os.tmpdir()`, `node:test` runner via `tsx` (existing test setup).

**Design source:** `.designs/2026-04-26-mcp-broker-spillover.md`

---

### Task 1: Spillover module with pure logic and IO

**Files:**

- Create: `pi/agent/extensions/mcp-broker/spillover.ts`
- Create: `pi/agent/extensions/mcp-broker/spillover.test.ts`

**Acceptance Criteria:**

- `joinText(content)` aggregates text blocks (joined with `"\n"`); ignores image and other non-text blocks; returns `""` for image-only or empty content.
- `buildEnvelope({ filePath, originalSize, joinedText })` returns the documented envelope string verbatim — `<persisted-output>` wrapper, backtick-wrapped path, "Output too large (X.X KB / N chars)…" header, "Preview (first 2 KB):" with the head, "…N bytes truncated…" marker (correct byte count), and the closing read-tool instruction.
- `spillIfNeeded(content, toolCallId)` is the public entry point: returns either `{ spilled: false, content }` (passthrough) or `{ spilled: true, content, filePath, originalSize }` (envelope-wrapped content with image blocks preserved); on `writeFile` failure returns `{ spilled: false, content }` and logs a `console.warn`.

**Notes:**

- Constants live at the top of `spillover.ts`: `THRESHOLD_CHARS = 25_000`, `PREVIEW_BYTES = 2_000`, `SPILL_DIR = join(tmpdir(), "pi-mcp-broker")`. The KB display is `(originalSize / 1024).toFixed(1)`.
- Use `mkdir(SPILL_DIR, { recursive: true })` before writing; `writeFile(path, text, { flag: "wx" })`. Filename is `<toolCallId>.txt`. If the toolCallId contains characters unsafe for filenames, sanitize with `replace(/[^a-zA-Z0-9_:-]/g, "_")` (mirrors `subagents/spawn.ts:190`).
- `mkdir`/`writeFile` failures both fall through the same catch — return passthrough and warn.
- Preview head is computed on the joined text via `joinedText.slice(0, PREVIEW_BYTES)`; the truncated-byte count in the marker is `Buffer.byteLength(joinedText, "utf8") - Buffer.byteLength(head, "utf8")`. Use byte length, not char length, so the marker is byte-accurate. The "Output too large (… / N chars)" header uses `joinedText.length` (chars) — both numbers are intentional and meaningful.
- The returned `content` array preserves image blocks (passes them through unchanged) and replaces all text blocks with one envelope text block at the position of the first text block. If callers don't care about block order, a simpler shape is fine — image blocks just need to survive.
- The test file imports source with `.ts` extensions per the existing project convention (see `tools.test.ts:3`).
- Tests must cover: below-threshold passthrough; above-threshold spill (file written, envelope returned, details correct); multi-block text aggregation; image blocks preserved; image-only/empty passthrough; `writeFile` failure passthrough (mock the fs module or pass an unwritable path); preview truncated to 2,000 bytes with the correct truncated-byte count in the marker; envelope path is wrapped in backticks.
- Use `node:test`'s `before`/`after` to create and clean a per-test scratch dir under `tmpdir()`. Override `SPILL_DIR` indirectly by accepting a `dir` option on `spillIfNeeded` (default `SPILL_DIR`), so tests don't pollute the real directory. Document the option as test-only.

**Commit:** `feat(mcp-broker): add spillover module for large mcp_call results`

---

### Task 2: Wire spillover into `mcp_call`

**Files:**

- Modify: `pi/agent/extensions/mcp-broker/tools.ts:215-278` (the `mcp_call` registration; specifically both `return` paths inside `execute` — the success path at ~238 and the session-retry success path at ~260)
- Modify: `pi/agent/extensions/mcp-broker/tools.test.ts` (add tests for the spillover integration)

**Acceptance Criteria:**

- After a successful broker call (both initial and post-retry success paths), `spillIfNeeded(content, toolCallId)` is invoked; if it returns `spilled: true`, the returned `details` includes `spilled: true`, `spillFilePath: <path>`, `originalSize: <chars>`, and `content` is the envelope-wrapped array.
- Below-threshold results are unchanged — `details` does not include `spilled`/`spillFilePath`/`originalSize` (no false positives).
- The error-result path (`brokerError === true`) is **not** spilled — error responses are short by nature and the agent needs to see them inline. The marker text the execute path unshifts onto error content stays at index 0 as today.

**Notes:**

- `_id` (the first `execute` arg) is the `toolCallId`. Rename it to `toolCallId` in the `execute` signature for clarity, since we now use it.
- Apply spillover only after determining `brokerError`; if `brokerError`, skip spillover entirely. Otherwise pass the (text-only) `content` to `spillIfNeeded`. Image blocks pass through `spillIfNeeded` unchanged regardless.
- Preserve the existing `details` keys (`name`, `brokerError`, and `retried` on the retry path) — spread or explicitly assign so spillover keys are additive.
- Test additions should follow the existing pattern in `tools.test.ts`. New tests:
  - "mcp_call spills oversize content": stub the broker client to return a 30K-char text payload; assert envelope appears in result content, `details.spilled === true`, `details.spillFilePath` matches the file actually written.
  - "mcp_call passes through under-threshold content": stub a 5K-char payload; assert content unchanged, no spillover keys in `details`.
  - "mcp_call does not spill error responses": stub `isError: true` with a 30K-char payload; assert no envelope, no spillover keys.
- Stub the broker client by constructing a minimal object that conforms to the surface `mcp_call.execute` actually uses (`callTool`); pass it via the existing `registerTools(pi, client)` shape — the tests will need to also stub a minimal `pi` to capture the registration. If that's painful, refactor the body of `mcp_call.execute` into an exported helper (`callBrokerTool(client, params, toolCallId, signal)`) and unit-test the helper directly. Either approach is fine — pick whichever is cleaner.
- Use the same per-test scratch dir technique from Task 1 to keep file IO local.

**Commit:** `feat(mcp-broker): spill oversize mcp_call results to file`

---

### Task 3: README documentation

**Files:**

- Modify: `pi/agent/extensions/mcp-broker/README.md` (add a new "Large output spillover" section after "Configuration", before "Guard behavior")

**Acceptance Criteria:**

- New section explains the threshold (25,000 chars of joined text), the file location (`${tmpdir()}/pi-mcp-broker/<toolCallId>.txt`), the envelope format (with a small example), and the failure-mode (write failure → inline fallback).
- Section also notes: only `mcp_call` is affected (not `mcp_search`/`mcp_describe`); error responses are never spilled; image blocks are preserved inline.
- "File layout" list at the bottom of the README gains a `spillover.ts` entry between `tools.ts` and `guard.ts`.

**Notes:**

- Keep the section ~150 words; reference the design doc rather than restating every decision.
- Use a fenced code block to show a one-line truncated example of the envelope so readers know what the agent sees.

**Commit:** `docs(mcp-broker): document large output spillover`

---

<!-- Subagents/agents docs do not need updates — spillover is broker-internal and transparent to callers. -->
