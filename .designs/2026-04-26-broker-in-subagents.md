# MCP Broker in Subagents (Read-Only Mode)

**Date:** 2026-04-26
**Status:** Design approved, pending implementation

## Problem

The `mcp-broker` Pi extension exposes the MCP broker (git, GitHub, etc.) to the agent via `mcp_search`/`mcp_describe`/`mcp_call`. Today only the parent agent can use it — subagents have no broker access. This forces broker work to happen in the main context, defeating the usual "delegate to a subagent to keep the context clean" pattern.

We want `research` and `review` subagents to be able to call broker tools, but only in **read-only mode** so a delegation can't accidentally mutate remote state (push, merge a PR, comment on an issue, etc.).

## Goals

1. `research` and `review` subagents have access to the broker.
2. Both run in read-only mode by default — only tools the broker advertises as read-only are callable.
3. The mechanism for activating read-only mode is generic (env var passthrough) so other extensions can use the same pattern.
4. Programmatic spawn callers (`autoralph`, `_workflow-core`) can also pass env vars when they need to.

## Non-goals (YAGNI)

- Per-call `env` on the `spawn_agents` tool params. Frontmatter is sufficient.
- Truthy parsing of the env var (`"true"`, `"yes"`, etc.). Only `"1"` activates.
- A configurable read/write classifier — trust the broker's `readOnlyHint` annotation.
- Broker access for `explore`. Keep it local-codebase-focused.
- Migrating `code` to the broker by default. It already has full access.

## Design

### Section 1 — Env passthrough across the spawn surface

Three layers; each adds one optional field and forwards it.

**Layer 1 — `spawnSubagent` (the public primitive):**

- `SpawnInvocation` (in `subagents/spawn.ts`) gains `env?: Record<string, string>`.
- `spawn.ts:253` becomes:
  ```ts
  env: { ...process.env, ...options.env, PI_SUBAGENT_DEPTH: ... }
  ```
- Caller env overrides parent process env, but `PI_SUBAGENT_DEPTH` always wins.

**Layer 2 — agent definitions (the `spawn_agents` tool path):**

- `loader.ts` parses an optional `env:` map from frontmatter.
- `AgentDefinition` (in `subagents/types.ts`) gains `env?: Record<string, string>`.
- `subagents/index.ts:96` (`runSpawn`) forwards `env: agent.env` to `spawnSubagent`.

**Layer 3 — programmatic wrappers:**

- `autoralph/lib/dispatch.ts`: `DispatchOptions` gains `env?: Record<string, string>`, forwarded at line 28.
- `_workflow-core/lib/subagent.ts`: `DispatchSpec` gains `env?: Record<string, string>`, forwarded inside `dispatchOne` at line 67. `_workflow-core/lib/types.ts` updated similarly.

### Section 2 — Broker read-only mode

**Read the env var once at startup.** In `mcp-broker/index.ts`:

```ts
const readOnly = process.env.MCP_BROKER_READONLY === "1";
const client = new BrokerClient({ readOnly });
```

Treat any value other than `"1"` as off — no fancy parsing.

**Surface annotations from MCP.** `BrokerTool` (in `client.ts`) gains an `annotations` field passed through from `result.tools`:

```ts
export type BrokerTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean; [k: string]: unknown };
};
```

**Filter at the source — `BrokerClient.listTools()`:**

```ts
async listTools(): Promise<BrokerTool[]> {
  const client = await this.getClient();
  const result = await client.listTools();
  const all: BrokerTool[] = (result.tools ?? []).map(...);
  const tools = this.readOnly ? all.filter(isReadOnly) : all;
  this.cachedTools = tools;
  this.cachedProviders = extractProviders(tools);
  return tools;
}

function isReadOnly(t: BrokerTool): boolean {
  return t.annotations?.readOnlyHint === true;
}
```

`readOnlyHint === true` only — missing or `false` is treated as write. Safe failure mode; a newly added broker tool is excluded by default until annotated.

**Defense in depth in `mcp_call`.** Even though listing hides write tools, the agent might know a tool name from prior context. `tools.ts` `mcp_call.execute` checks the cached (already filtered) tool list and rejects unknown names with: `"mcp_call: tool '<name>' is not available in read-only mode"`. Same code path catches typos.

**System prompt tweak.** `buildBrokerPrompt` (in `index.ts`) appends one line when `readOnly`:

> "Read-only mode: only listed tools are callable. Write tools (create/edit/merge/push/etc.) are not available."

**Bash guard.** `guard.ts` fuzzy-matches bash `gh ...` calls against the cached tool list to suggest broker tools. Since the cached list is already filtered, the guard naturally only suggests read-only tools in read-only mode — no extra code needed.

### Section 3 — Agent definitions

**`pi/agent/agents/research.md`:**

```yaml
---
name: research
tools: read,ls,find,grep
extensions: web-access,mcp-broker
env:
  MCP_BROKER_READONLY: "1"
---
```

System prompt body: add one sentence noting the broker is available as a research surface alongside web search/fetch.

**`pi/agent/agents/review.md`:**

```yaml
---
name: review
tools: read,ls,find,grep
extensions: mcp-broker
env:
  MCP_BROKER_READONLY: "1"
---
```

System prompt body: add a sentence noting the broker is available for reading PR/issue context (`gh_view_pr`, `gh_diff_pr`, `gh_list_pr_comments`, etc.).

**`pi/agent/agents/explore.md`:** unchanged — no broker access.

**`pi/agent/agents/code.md`:** unchanged — keeps full broker access (no env var, no filter).

**Inheritance from parent broker setup.** `MCP_BROKER_ENDPOINT` and `MCP_BROKER_AUTH_TOKEN` come from the parent shell env, which subagents inherit naturally. No agent-frontmatter change needed for those — they Just Work as long as the parent has them set.

**README updates:**

- `subagents/README.md`: document the new `env:` frontmatter field; add `research` and `review` to the broker column in the agent-types table.
- `mcp-broker/README.md`: add a "Read-only mode" section explaining `MCP_BROKER_READONLY=1` and how it interacts with `readOnlyHint`. Mention that subagents activate it via frontmatter.

**Coupling note.** `research` previously had no broker dependency — now spawning `research` requires `mcp-broker` to be installed and discoverable. If `mcp-broker` is missing, the existing extension-allowlist resolution in `subagents/utils.ts` returns "no matching extensions found" — loud, early failure. Worth a one-line mention in the README.

### Section 4 — Testing and rollout

**Pure-logic tests (run via `make test`):**

- `subagents/loader.test.ts`: parse `env:` field, missing field → undefined, malformed → loader error.
- `subagents/spawn.test.ts`: env merge precedence (`process.env` < `options.env` < `PI_SUBAGENT_DEPTH`); test by inspecting the args passed into a mocked `spawn`.
- `mcp-broker/client.test.ts`: `listTools` filter with `readOnly: true` (kept/dropped/missing-hint cases) and `readOnly: false` (no filter).
- `mcp-broker/tools.test.ts`: `mcp_call` rejects names not in the (filtered) cached list with the read-only error.
- `mcp-broker/index.test.ts`: env var `"1"` → readOnly true, anything else → false. `buildBrokerPrompt` adds the read-only line only when filtered.
- `_workflow-core/lib/subagent.test.ts`: `env` in `DispatchSpec` reaches the spawn call.

**Integration check (manual):** run `pi` end-to-end, spawn a `research` subagent, confirm `mcp_search` returns only read-only tools and `mcp_call gh_create_pr` is rejected.

**Rollout order** (each step independently safe to ship):

1. Spawn-level env passthrough (Section 1, layers 1+3 — no behavior change without callers using it).
2. Frontmatter `env:` parsing + agent-tool path (Section 1, layer 2).
3. Broker read-only mode (Section 2 — defaults off, no behavior change).
4. Wire up `research`/`review` agent definitions (Section 3 — the actual cutover; one PR, easy to revert).

**Pre-cutover check:** does the upstream MCP broker actually populate `readOnlyHint` for its tools today? If not, the read-only mode will return an empty tool list. Verify _before_ shipping step 4.

## Decisions log

- **Which agents:** `research` + `review`. Not `explore` (orthogonal — local codebase only). Not a new dedicated broker agent (would fragment the agent surface).
- **Read/write classification:** trust the broker server's `readOnlyHint` annotation. Strict — `=== true` only; missing or `false` is filtered out.
- **Wiring mechanism:** agent frontmatter declares env vars. Cleanest separation; no per-call config in the LLM tool surface.
- **Env var name:** `MCP_BROKER_READONLY` (not `PI_MCP_BROKER_READONLY`).
- **Env merge order:** `process.env` < `options.env` < `PI_SUBAGENT_DEPTH`. Agent env can override parent shell env; recursion guard always wins.
