# MCP Broker in Subagents (Read-Only Mode) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Give `research` and `review` subagents read-only access to the MCP broker, via a generic env-passthrough mechanism on the spawn surface plus a broker-side filter driven by MCP `readOnlyHint` annotations.

**Architecture:** Three layers gain an optional `env?: Record<string, string>` field that is forwarded down to `child_process.spawn` (`spawnSubagent` → `AgentDefinition` frontmatter → programmatic wrappers in `autoralph` and `_workflow-core`). The `mcp-broker` extension reads `MCP_BROKER_READONLY=="1"` once at startup; when set, `BrokerClient.listTools()` filters to tools whose MCP annotation has `readOnlyHint === true`, and `mcp_call` rejects names not in that filtered cache. `research.md` and `review.md` declare `MCP_BROKER_READONLY: "1"` in their frontmatter.

**Tech Stack:** TypeScript, Node `node:test`, Pi extension API (`@mariozechner/pi-coding-agent`), `@modelcontextprotocol/sdk`. All existing — no new deps.

---

### Task 1: Add `env` passthrough to `spawnSubagent`

**Files:**

- Modify: `pi/agent/extensions/subagents/spawn.ts` (add field to `SpawnInvocation`, merge in `runSpawn`)
- Modify: `pi/agent/extensions/subagents/spawn.test.ts` (new tests for env merge precedence)

**Acceptance Criteria:**

- `SpawnInvocation` (in `spawn.ts`) gains an optional `env?: Record<string, string>` field; when provided, it is forwarded into `runSpawn` and merged into the child process env as `{ ...process.env, ...options.env, PI_SUBAGENT_DEPTH: ... }` — caller env overrides parent shell env, but `PI_SUBAGENT_DEPTH` always wins.
- New unit test in `spawn.test.ts` injects a stub for `child_process.spawn` (or otherwise inspects the env passed to it) and asserts the precedence: `process.env < options.env < PI_SUBAGENT_DEPTH`. Use a temp env var like `MCP_BROKER_READONLY` set on `process.env` to a value the caller overrides, plus an attempt to override `PI_SUBAGENT_DEPTH` that the implementation must ignore.
- Existing tests in `spawn.test.ts` still pass.

**Notes:**

- `runSpawn` is currently a free function that constructs the env inline at `spawn.ts:253`. Plumb `env` through `runSpawn`'s parameters (or capture it via closure inside `spawnSubagent`) — pick whichever is the smaller diff. The signature change is internal to this file.
- Stubbing `child_process.spawn` from a test: import the module namespace and use `mock.method(spawnModule, "spawn", ...)` from `node:test`. Don't actually launch a `pi` process; resolve the child immediately with `code: 0` and assert the env captured in the stub call args.
- No need to test the full happy path through `pi` — the existing tests already cover that surface; this task only needs to verify env merge.

**Commit:** `feat(subagents): forward env from SpawnInvocation to child process`

---

### Task 2: Parse `env:` map from agent frontmatter

**Files:**

- Modify: `pi/agent/extensions/subagents/types.ts` (add `env?: Record<string, string>` to `AgentDefinition`)
- Modify: `pi/agent/extensions/subagents/loader.ts` (parse the `env:` block)
- Modify: `pi/agent/extensions/subagents/loader.test.ts` (add coverage)

**Acceptance Criteria:**

- `AgentDefinition.env?: Record<string, string>` exists; agents without an `env:` block get `env: undefined`.
- `loader.ts` parses an indented YAML-style map under `env:`, e.g.:
  ```yaml
  env:
    MCP_BROKER_READONLY: "1"
    SOME_OTHER_VAR: "value with spaces"
  ```
  into `{ MCP_BROKER_READONLY: "1", SOME_OTHER_VAR: "value with spaces" }`. Quoted values get their surrounding quotes stripped (single or double).
- New tests cover: (a) missing `env:` → `undefined`; (b) one key parses correctly; (c) multiple keys parse; (d) quoted vs unquoted values both work; (e) malformed lines (no colon) inside the env block are skipped silently. Don't add a "loader error" path — the existing parser is forgiving by design.

**Notes:**

- The current `parseFrontmatter` in `loader.ts` is line-by-line and treats every key as a flat string, so `env:` with indented children won't work without a small extension. Simplest approach: after the existing flat parse, do a second pass that detects `env:` (with no value on the same line) and reads subsequent lines that begin with whitespace + `key: value` as the env map. Stop at the first non-indented line. Keep the parser local to `loader.ts` — don't reach for a YAML library.
- Design says "malformed → loader error" but the existing loader is silently forgiving for everything else; match that style. The cost of stricter parsing isn't worth the asymmetry.
- Keep `AgentDefinition.env` optional, not `Record<string, string> | undefined` written out — match the existing optional-field style (`model?`, `thinking?`).

**Commit:** `feat(subagents): parse env map from agent frontmatter`

---

### Task 3: Forward agent `env` through `runSpawn` to `spawnSubagent`

**Files:**

- Modify: `pi/agent/extensions/subagents/index.ts` (pass `agent.env` to `spawnSubagent` inside `runSpawn`)
- Modify: `pi/agent/extensions/subagents/index.test.ts` (if it exists and exercises `runSpawn`); otherwise no test change needed beyond what Task 1 + Task 2 already cover.

**Acceptance Criteria:**

- The `runSpawn` function in `index.ts` (around line 96) passes `env: agent.env` to `spawnSubagent`.
- Existing tests still pass; `make typecheck` clean.

**Notes:**

- Pure plumbing — one new field in the call site. Don't add new tests just for forwarding; the loader parses it (Task 2) and the spawn merges it (Task 1), and an integration test would require launching `pi` for real.
- Keep `agent.env` literally — don't filter or transform. If a downstream consumer needs validation, it owns that.

**Commit:** `feat(subagents): forward agent env to spawn`

---

### Task 4: Add `env` passthrough to programmatic wrappers (`autoralph`, `_workflow-core`)

**Files:**

- Modify: `pi/agent/extensions/autoralph/lib/dispatch.ts` (add `env?` to `DispatchOptions`, forward at `spawnSubagent` call)
- Modify: `pi/agent/extensions/_workflow-core/lib/types.ts` (add `env?` to `DispatchSpec`)
- Modify: `pi/agent/extensions/_workflow-core/lib/subagent.ts` (forward `spec.env` inside `dispatchOne` when calling `spawn`)
- Modify: `pi/agent/extensions/_workflow-core/lib/subagent.test.ts` (one test that asserts `env` reaches the `spawn` fake)

**Acceptance Criteria:**

- `DispatchOptions.env?: Record<string, string>` and `DispatchSpec.env?: Record<string, string>` exist.
- Both wrappers pass `env` through to their underlying `spawnSubagent` / injected `spawn`.
- New `_workflow-core/lib/subagent.test.ts` test: pass `env: { FOO: "bar" }` in a `DispatchSpec`, and the fake `spawn` records that the invocation it received had `env.FOO === "bar"`.

**Notes:**

- `_workflow-core/lib/subagent.test.ts` already uses fake spawn functions that just return outcomes — extend one to record the invocation.
- No need to add a corresponding test in `autoralph/lib/dispatch.test.ts` — the change there is one-line forwarding, type-checked by `tsc`. If `dispatch.test.ts` already mocks `spawnSubagent`, add an assertion; otherwise skip.

**Commit:** `feat(workflow): plumb env through dispatch wrappers`

---

### Task 5: Surface `annotations` on `BrokerTool` and add `readOnly` filter to `BrokerClient`

**Files:**

- Modify: `pi/agent/extensions/mcp-broker/client.ts` (extend `BrokerTool`, accept `readOnly` in constructor, filter in `listTools`)
- Modify: `pi/agent/extensions/mcp-broker/client.test.ts` (cover `readOnly: true` filter, `readOnly: false` no-op)

**Acceptance Criteria:**

- `BrokerTool` gains `annotations?: { readOnlyHint?: boolean; [k: string]: unknown }`, populated from `result.tools[i].annotations` in `listTools`.
- `BrokerClient` constructor accepts `{ readOnly?: boolean } = {}`; `readOnly` defaults to `false`.
- When `readOnly === true`, `listTools()` filters the result to only tools where `tool.annotations?.readOnlyHint === true`. Tools missing `annotations` or with `readOnlyHint !== true` are dropped. Cached `cachedTools` and `cachedProviders` reflect the filtered list.
- New tests in `client.test.ts` use a stubbed underlying MCP client (similar to how `tools.test.ts` stubs `BrokerClient`) to assert: (a) with `readOnly: true`, only tools with `readOnlyHint === true` are returned; tools with `readOnlyHint: false`, `readOnlyHint` missing, or no `annotations` are filtered out; (b) with `readOnly: false` (or unset), all tools pass through unchanged including their annotations field; (c) the filter runs once at `listTools` time — `cachedTools` and `cachedProviders` reflect post-filter state.

**Notes:**

- Test approach: `BrokerClient` instantiates an MCP `Client` lazily inside `getClient()`. Either factor out a tiny seam (e.g. accept an optional `client` in the constructor for test injection) **or** make the existing test only exercise the pure functions (`isReadOnly`/filter logic) by exporting them. **Prefer exporting `isReadOnly` and a small `filterReadOnly(tools)` helper, then unit-testing those directly.** Keeps the change small and avoids adding a constructor seam just for tests.
- `extractProviders` already operates on the resulting tool list; no change needed — it just sees fewer tools when `readOnly` is on.
- Strict equality: `tool.annotations?.readOnlyHint === true` — anything else (missing, `false`, `"true"` string) is treated as write. Document this with one short comment on the helper.

**Commit:** `feat(mcp-broker): add readOnly mode to BrokerClient`

---

### Task 6: Read `MCP_BROKER_READONLY` at startup, defense-in-depth in `mcp_call`, prompt tweak

**Files:**

- Modify: `pi/agent/extensions/mcp-broker/index.ts` (read env var, pass `readOnly` to `BrokerClient`, append prompt line)
- Modify: `pi/agent/extensions/mcp-broker/tools.ts` (`mcp_call` checks cached tool list before calling)
- Modify: `pi/agent/extensions/mcp-broker/tools.test.ts` (add the rejection test)
- Modify: `pi/agent/extensions/mcp-broker/index.test.ts` (cover prompt suffix)

**Acceptance Criteria:**

- In `index.ts`: `const readOnly = process.env.MCP_BROKER_READONLY === "1"`. Treat any other value as off — no truthy parsing.
- `new BrokerClient({ readOnly })` is wired up.
- `buildBrokerPrompt(tools, readOnly)` — extend the signature with a second arg; when `readOnly` is true, append on its own line: `Read-only mode: only listed tools are callable. Write tools (create/edit/merge/push/etc.) are not available.`
- Update the call site in `index.ts:before_agent_start` to pass `readOnly`.
- In `tools.ts`, `mcp_call.execute` (and its core `callBrokerTool`): before calling `client.callTool(...)`, fetch `client.getCachedTools()`; if non-null and the requested name is not in the list, return `errorResult("mcp_call: tool '<name>' is not available in read-only mode")`. If the cache is `null` (broker never reached), skip the guard so existing error paths remain in charge.
- New `tools.test.ts` test: stub the broker `client` so `getCachedTools()` returns `[{name: "git.git_pull", annotations: {readOnlyHint: true}}]`; calling `mcp_call` with `name: "git.git_push"` returns the read-only rejection text without invoking `callTool`. Use a `callTool` stub that throws if invoked, to assert it isn't.
- New `index.test.ts` test: `buildBrokerPrompt(TOOLS, true)` includes the read-only line; `buildBrokerPrompt(TOOLS, false)` does not.

**Notes:**

- The existing `BrokerClient` stub used in `tools.test.ts` already exposes `listTools`, `callTool`, `reset`. Add `getCachedTools` as a `() => [...]` stub.
- The error message wording is verbatim from the design — keep it.
- Don't gate the guard on `readOnly` itself in `tools.ts` — the cache is already filtered, so an unknown name is unknown regardless of mode. The error message should still say "in read-only mode" because that's the only case where this guard fires meaningfully. (When read-only is off, all real broker tools are in the cache, so a missing name means a typo — and a "not available in read-only mode" message is misleading there.) Decision: only emit the read-only-specific message when `readOnly` is true; when off and the cache is populated and the tool is missing, fall back to the existing behavior (let the broker's own error surface). Keep the check simple — pass `readOnly` into `callBrokerTool` and gate on it.
- The "Bash guard" requires no code change — `guard.ts` consumes the cached tool list, which is already filtered.

**Commit:** `feat(mcp-broker): enforce readOnly via env var and tool-cache guard`

---

### Task 7: Pre-flight check that the broker actually populates `readOnlyHint`

**Files:**

- Run: `pi mcp_search` (or equivalent) against the live broker to inspect annotations on shipped tools. No code change unless results are unexpected.

**Acceptance Criteria:**

- Manually verify (and report back in the PR description for Task 8) that the upstream broker populates `annotations.readOnlyHint = true` on at least the read-only `github.gh_*` tools (`gh_view_pr`, `gh_diff_pr`, `gh_list_pr_comments`, `gh_list_prs`, etc.) and the read-only `git.git_*` tools (`git_list_remotes`, `git_list_remote_refs`).
- If the broker does **not** populate `readOnlyHint` today, do not proceed to Task 8 — escalate. This task is the gate for the cutover.

**Notes:**

- Quickest check: from a Pi session with the broker connected, `mcp_search ""` prints all tools, then `mcp_describe github.gh_view_pr` prints the schema. The MCP SDK doesn't include annotations in the description text by default — easier to drop a one-time `console.log(t.annotations)` inside `BrokerClient.listTools` (in a throwaway local commit, **don't ship**) and run `pi --mode json -p "list broker tools" --no-session` once. Or: temporarily add an `annotations` print to `mcp_describe`.
- This is investigative, not implementation. It exists in the plan because shipping Task 8 with `readOnlyHint` unset means subagents see an empty broker tool list — silent failure mode.
- If `readOnlyHint` is missing: file a follow-up against the broker server, and **stop here**. Tasks 1–6 are independently safe to ship; only Task 8 cuts over the agent surface.

**Commit:** _(no commit — this task is a manual verification gate)_

---

### Task 8: Wire up `research.md` and `review.md` to use read-only broker

**Files:**

- Modify: `pi/agent/agents/research.md` (add `mcp-broker` to extensions, add `env: MCP_BROKER_READONLY: "1"`, mention broker in body)
- Modify: `pi/agent/agents/review.md` (same pattern; mention broker for PR/issue context)

**Acceptance Criteria:**

- `research.md` frontmatter `extensions: web-access, mcp-broker` and an `env:` block setting `MCP_BROKER_READONLY: "1"`. Body gets one new sentence noting the broker is available alongside web search/fetch.
- `review.md` frontmatter `extensions: mcp-broker` and the same `env:` block. Body gets one new sentence: the broker is available for reading PR/issue context (mention `gh_view_pr`, `gh_diff_pr`, `gh_list_pr_comments` as examples).
- `explore.md` and `code.md` are **not** touched.
- Manual smoke test (don't gate the commit on it, but verify before merge): spawn a `research` subagent with prompt `"List the broker tools you can see"` and confirm the output only contains tools annotated read-only; spawn the same subagent with prompt `"Use mcp_call to invoke github.gh_create_pr with body=test"` and confirm it returns the read-only rejection.

**Notes:**

- This is the cutover. Keep it as its own commit so it's trivially revertable.
- `MCP_BROKER_ENDPOINT` and `MCP_BROKER_AUTH_TOKEN` are inherited from the parent shell env via `process.env` and don't need to be declared in agent frontmatter.

**Commit:** `feat(agents): give research and review read-only broker access`

---

### Task 9: Documentation updates

**Files:**

- Modify: `pi/agent/extensions/subagents/README.md`
  - Add the new `env:` field to the **Agent file format** section (list of fields and an example)
  - Update the **Built-in types** table: add the `mcp-broker` extension to the `research` and `review` rows
  - Update the prose under the table to note that `research` and `review` are read-only-broker-enabled (and that `research` adds web-access on top)
  - Add a **Coupling note** mentioning that spawning `research`/`review` now requires `mcp-broker` to be installed and discoverable; if missing, the existing extension-allowlist resolution returns "no matching extensions found"
- Modify: `pi/agent/extensions/mcp-broker/README.md`
  - Add a new section `## Read-only mode` after **Configuration**, explaining `MCP_BROKER_READONLY=1`, that only `readOnlyHint === true` tools are callable, that subagents activate it via frontmatter, and the defense-in-depth `mcp_call` rejection
- Modify: `CLAUDE.md` — only if a new "agent extension" section is needed; review whether existing guidance covers this (likely not, skip)

**Acceptance Criteria:**

- Both READMEs reflect the new behavior with no stale claims.
- Tables and field lists are accurate vs. the changes from Tasks 2 and 5–6.

**Notes:**

- `subagents/README.md` currently asserts on lines 40–44 that `review` has no extensions and `research` only has `web-access`. Both need updating.
- `subagents/README.md` line 89 currently says `research requires the web-access extension to be installed and discoverable`. Add the same note for `mcp-broker` and for `review`.
- `mcp-broker/README.md` does not currently mention `readOnlyHint` — introduce it in the new section.

**Commit:** `docs: document broker readOnly mode and subagent env field`

---

## Rollout note

Tasks 1–6 are independently safe to ship — none change agent-visible behavior on their own. Task 7 is the gate. Task 8 is the cutover.

Tasks 1–4 (env passthrough) form one logical unit; could be one PR. Tasks 5–6 (broker filter) form another. Task 8 is its own PR for easy revert. Task 9 ships alongside Task 8.
