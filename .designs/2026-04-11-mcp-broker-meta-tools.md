# MCP Broker Meta-Tools (v1)

**Date:** 2026-04-11
**Scope:** Replace the `broker-cli`-based Pi integration with three native MCP meta-tools that talk to the broker directly over its MCP endpoint.

## Problem

Today the `mcp-broker` Pi extension is a hybrid of a markdown skill (`skills/broker-cli/SKILL.md`) telling the agent to shell out to `broker-cli`, plus a `guard.ts` that blocks direct `gh`/remote-git bash calls and steers the agent toward CLI equivalents. The call stack is:

```
agent → bash → broker-cli (Go/Cobra) → HTTP → mcp-broker → upstream MCP servers
```

Friction points:

1. **Discovery is a bash ritual.** The agent must run `broker-cli --help` → `broker-cli <ns> --help` → `broker-cli <ns> <tool> --help` every session to learn what exists.
2. **Complex args are ugly.** The CLI maps scalar JSON Schema to flags; arrays/objects fall back to `--raw-field key='["a","b"]'` or `--raw-input '{...}'`, which the agent frequently mis-escapes inside bash.
3. **Errors are stderr + exit code.** No structured `isError` distinction; the agent parses stderr text.
4. **Guard is reactive.** The agent learns a tool is blocked _after_ trying it, then gets steered.

The broker already speaks MCP natively over Streamable HTTP at `/mcp`, so `broker-cli` is a translation layer we don't need in-process.

## Rationale: why meta-tools and not defer-style lazy loading

Before landing on the three-tool design, we looked at how Claude Code handles the same problem — it has a `ToolSearch` tool and a `defer_loading: true` API flag that lets large MCP tool sets stay hidden from the model until discovered. On the surface that's an appealing model: the agent would call upstream MCP tools directly as first-class tools (no `mcp_call` wrapper), and only pay the context cost for tools it actually uses.

**We are deliberately not copying that pattern.** It is not cache-safe for our environment, and cache stability is a primary constraint.

What Claude Code actually does (from `claude-code/src/services/api/claude.ts:1154-1246` and `src/utils/toolSearch.ts:154-157`):

1. Every request recomputes `filteredTools` by scanning the message history for `tool_reference` blocks (`extractDiscoveredToolNames(messages)`).
2. The tools array sent to the API **grows over the course of a conversation** as new upstream tools get discovered via ToolSearch. There's even a telemetry log — `"Dynamic tool loading: N/M deferred tools included"` — that exists specifically because the count changes per turn.
3. `addCacheBreakpoints()` places cache markers on **messages**, not on the tools array. When the tools array mutates, the serialized request is byte-different at the tools position, and the prompt cache is invalidated from that point forward on the turn a new tool gets discovered.

Claude Code accepts this cost because, at their scale, the context-window savings from not pre-declaring 50+ MCP tools outweigh one cache miss per tool discovery. Our constraints are different: we want the prompt cache to stay hot across long Pi sessions, and we don't have Anthropic's API-level `defer_loading` support available from inside a Pi extension anyway.

**The three-tool meta-tool design is the cache-safe choice, not a fallback:**

- The tools array is static: `mcp_search`, `mcp_describe`, `mcp_call`, plus whatever else the extension ships. It never changes across turns, regardless of how many broker tools the agent discovers or invokes.
- All broker-tool invocations flow through `mcp_call`, so the cache prefix at the tools position is stable for the entire session.
- Discovery happens at the **message** level — tool results appended to the conversation — which is append-only and preserves the cached prefix up to the last breakpoint.

The tradeoff we accept: each `mcp_call` carries `{name, arguments}` wrapper tokens in the tool-call payload, and the model doesn't see upstream tool parameters as typed fields in its tool list. That's a modest per-call cost, but it's predictable and doesn't compound with conversation length the way cache misses do.

**Non-negotiable:** no dynamic tool registration mid-session. Any future change that adds, removes, or mutates the tools array after Pi starts the agent turn-loop is an explicit regression on the cache stability we're designing for.

## Decision

Register three Pi tools that talk to the broker directly via the official MCP TypeScript SDK:

- `mcp_search(query)` — find broker tools by substring match on name + description.
- `mcp_describe(name)` — return the full description and input schema for a named tool.
- `mcp_call(name, arguments)` — invoke a broker tool with a JSON-object argument.

Keep the bash guard (with updated steering text). Delete the bundled `broker-cli` skill. Rewrite the extension README for the new model.

### Decisions locked in

| Decision            | Choice                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Scope of v1         | Replace CLI, keep guard, delete bundled skill                                                                  |
| Transport           | MCP protocol only (`/mcp`, Streamable HTTP) — no REST fallback                                                 |
| Approval flow       | Block synchronously with a 10-minute timeout, defined as a constant matching the broker's own approval timeout |
| Cache               | None. Always-fresh `tools/list` on every `mcp_search`/`mcp_describe`                                           |
| Search              | Case-insensitive substring match on name + description; no ranking                                             |
| Search result shape | Name + one-line description per match (no schema — that's `describe`'s job)                                    |
| MCP client          | `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport`                                         |
| Skill fate          | Delete `pi/agent/extensions/mcp-broker/skills/broker-cli/` entirely                                            |
| Guard steer         | Redirect blocked `gh`/remote-git calls to `mcp_call` (and point at `mcp_search` for discovery)                 |
| Missing env vars    | Register tools anyway; fail loudly with a clear message on first call                                          |

## Architecture

### File layout

```
pi/agent/extensions/mcp-broker/
├── index.ts          ← factory: instantiates client, registers tools + guard
├── guard.ts          ← unchanged interception, updated steering text
├── tools.ts          ← mcp_search, mcp_describe, mcp_call definitions
├── client.ts         ← BrokerClient wrapping @modelcontextprotocol/sdk
├── package.json      ← { dependencies: { "@modelcontextprotocol/sdk": "^x.y" } }
└── README.md         ← rewritten for the new model (see below)
```

Deletions:

- `pi/agent/extensions/mcp-broker/skills/` — the entire bundled skill directory.
- `resources_discover`/`skills_discover` wiring in `index.ts` that points at the bundled skill.

### Component responsibilities

- **`index.ts`** — the required default-export factory. Instantiates a single shared `BrokerClient`, passes it to `registerTools(pi, client)` and `registerGuard(pi)`.
- **`client.ts`** — owns the MCP SDK `Client` + `StreamableHTTPClientTransport`. Lazy connect, reads env on first use, exposes `listTools()` / `callTool(name, args, signal)` / `reset()`. Concurrent first-calls are deduplicated via a `connecting: Promise<Client> | null` field.
- **`tools.ts`** — three `registerTool` definitions, each receiving the shared client via closure so they share a session.
- **`guard.ts`** — same bash-argv interception logic. Steering text updated to point at `mcp_call` / `mcp_search` instead of `broker-cli`. System-prompt reminder rewritten in kind.

### The three tools

**`mcp_search`** — "Find MCP tools available via the broker."

```typescript
parameters: Type.Object({
  query: Type.String({
    description:
      "Case-insensitive substring to match against tool name and description. Pass empty string to list all.",
  }),
});
```

Calls `client.listTools()`. Filters: `tool.name.toLowerCase().includes(q) || tool.description.toLowerCase().includes(q)`. Returns a text block with one line per match: `name — description`.

**`mcp_describe`** — "Get the input schema and full description of a broker tool."

```typescript
parameters: Type.Object({
  name: Type.String({
    description: "Exact tool name, e.g. 'github.create_pr'",
  }),
});
```

Calls `listTools()`, finds the match, returns description + pretty-printed JSON Schema for `inputSchema`. Returns a clear error if not found, pointing at `mcp_search`.

**`mcp_call`** — "Invoke an MCP broker tool with arguments."

```typescript
parameters: Type.Object({
  name: Type.String({ description: "Exact tool name from mcp_search" }),
  arguments: Type.Object(
    {},
    {
      additionalProperties: true,
      description:
        "Arguments matching the tool's inputSchema (use mcp_describe to see the schema)",
    },
  ),
});
```

Calls `client.callTool(name, arguments, signal)` with a 10-minute timeout. Passes the Pi `signal` through so user interrupts abort cleanly. Returns the MCP `content` array directly; if the response has `isError: true`, surfaces it as a Pi tool error.

### BrokerClient

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

export class BrokerClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    const endpoint = process.env.MCP_BROKER_ENDPOINT;
    const token = process.env.MCP_BROKER_AUTH_TOKEN;
    if (!endpoint || !token) {
      throw new Error(
        "broker endpoint not configured — set MCP_BROKER_ENDPOINT and MCP_BROKER_AUTH_TOKEN",
      );
    }

    this.connecting = (async () => {
      const transport = new StreamableHTTPClientTransport(
        new URL(`${endpoint}/mcp`),
        {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        },
      );
      const client = new Client(
        { name: "pi-mcp-broker", version: "0.1.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      this.client = client;
      return client;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async listTools() {
    return (await this.getClient()).listTools();
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    const client = await this.getClient();
    return client.callTool({ name, arguments: args }, undefined, {
      signal,
      timeout: APPROVAL_TIMEOUT_MS,
    });
  }

  async reset() {
    this.client = null;
  }
}
```

Key properties:

- **Lazy** — no network until the first tool call; env-var check deferred until then.
- **Connection reuse** — one `Client` per extension lifetime.
- **Concurrent-safe init** — `connecting` promise dedupes parallel first-calls.
- **Abort support** — `mcp_call` forwards its `signal`.
- **Session expiry** — `tools.ts` calls `client.reset()` and retries once on transport errors.

### Guard updates

Interception logic unchanged. Steering text rewritten:

```typescript
const STEER_GIT = `Don't invoke remote git directly. Use mcp_call with the broker's git tools instead.
Run mcp_search with query "git" to find them, then mcp_describe for the schema.`;

const STEER_GH = `Don't invoke gh directly. Use mcp_call with the broker's github tools instead.
Run mcp_search with query "github" to find them.`;
```

Blocked commands still: `gh <anything>`, `git push|pull|fetch|ls-remote|remote`. The turn-start system-prompt reminder currently at `guard.ts:32-38` is rewritten to reference the meta-tools instead of `broker-cli`.

### Namespace discovery hint

To help the agent know what kinds of things are available without having to blindly probe `mcp_search`, the extension injects a short namespace list into the system prompt at agent start. **This goes in the system prompt, not in any tool description** — keeping the tools array fully static, per the Rationale section.

Mechanism:

1. On the first call to `BrokerClient.getClient()` (or on `session_start`, whichever lands cleanest in the Pi event API), fetch `tools/list` once and cache the result on the client alongside the connected `Client` instance.
2. Extract unique namespace prefixes from tool names — everything before the first `.` (e.g. `github.create_pr` → `github`). Sort alphabetically.
3. On `before_agent_start`, append a one-line hint to the system prompt:
   ```
   The MCP broker currently exposes tools in these namespaces: git, github, linear, notion.
   Use mcp_search to find specific tools; tool names follow <namespace>.<tool>.
   ```
4. If the broker is unreachable at hint-generation time (missing env, network error), silently skip the hint — the agent still has `mcp_search` and the guard. Don't fail the agent start on a nice-to-have.

Cache implications:

- Tool descriptions never change → tools-array cache prefix stays stable across the session.
- The system prompt is set once per agent start and stable for the session → system prompt cache stays hot within a session.
- Across sessions, the hint may differ if providers come or go, which is fine — each new session starts its own cache lineage anyway.

Caveats to verify during implementation:

- Confirm `session_start` and `before_agent_start` exist in the Pi extension API and behave as described (the extension skill documents them, but I haven't read the types file). If `before_agent_start` fires multiple times per session, the hint-injection logic must be idempotent and use a cached provider list, not refetch.
- If both `session_start` and first-call lazy fetch are in play, the lazy fetch should be a no-op when the list is already cached — single source of truth.

## Error handling

| Case                              | Detection                       | Surface to agent                                                                                 |
| --------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Env vars unset                    | First `getClient()` call        | Tool error: "broker endpoint not configured — set MCP_BROKER_ENDPOINT and MCP_BROKER_AUTH_TOKEN" |
| Broker unreachable                | Transport throws on `connect()` | Tool error: "broker at &lt;endpoint&gt; unreachable: &lt;cause&gt;"                              |
| Session expired mid-session       | SDK rejects with session error  | `client.reset()`, retry once; if retry fails, surface the error                                  |
| Unknown tool name (describe/call) | Not in `listTools()` result     | Tool error: "no broker tool named 'X' — run mcp_search to find available tools"                  |
| Tool returned `isError: true`     | MCP response shape              | Pi tool error with the MCP `content` passed through                                              |
| Approval timeout (10 min)         | SDK timeout rejection           | Tool error: "broker approval timed out after 10 minutes — approve in the dashboard and retry"    |
| User interrupt                    | `AbortSignal` fires             | Let `AbortError` propagate; Pi handles it                                                        |

`mcp_call`'s catch block: abort errors re-throw, session errors retry once, everything else becomes a structured tool error with just the cause string. No stack traces in agent-visible messages.

## Testing

- **Type check** — `make typecheck` covers TypeScript correctness. Run after each edit.
- **Manual end-to-end**, in a project with `MCP_BROKER_ENDPOINT`/`MCP_BROKER_AUTH_TOKEN` set:
  - `mcp_search "git"` returns matches.
  - `mcp_describe git.git_push` returns the schema.
  - `mcp_call` with a safe read-only tool round-trips successfully.
  - `mcp_call` with a tool requiring approval blocks, then succeeds after approval in the dashboard.
  - `mcp_call` with a tool requiring approval blocks for 10 min, then times out with a clear error when not approved.
  - The guard still blocks `gh` and `git push`, and the new steer text points at `mcp_call`.
  - The namespace hint appears in the system prompt at agent start, lists the live broker's namespaces, and is gracefully omitted when the broker is unreachable.
- **No unit tests in v1** — this repo has no extension test infrastructure, and mocking the MCP SDK to cover ~100 lines of glue isn't worth it. Type safety + manual smoke covers the risk.

## README

The existing `pi/agent/extensions/mcp-broker/README.md` documents the current `broker-cli` + skill model and must be rewritten for the new design. The rewrite should:

- Replace the "What it does" and "Guard behavior" sections to describe the three meta-tools as the primary surface and the guard as a backup that catches native `gh`/git habits.
- Replace the "File layout" bullets to reflect `tools.ts` + `client.ts` + `package.json`, and drop the `skills/broker-cli/SKILL.md` line.
- Add a **Usage** section with example agent flow: `mcp_search` → `mcp_describe` → `mcp_call`.
- Add a **Configuration** section calling out `MCP_BROKER_ENDPOINT` and `MCP_BROKER_AUTH_TOKEN`.
- Add an **Inspiration** section at the bottom, matching the pattern used in `code-feedback/README.md`, `subagents/README.md`, `compact-tools/README.md`, `provider-usage/README.md`, and `ask-user/README.md`. At minimum it should cite:
  - [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) — proxy-tool pattern for exposing an MCP broker to Pi through a minimal set of meta-tools rather than one-tool-per-upstream-tool fan-out, with the notion that specific high-value tools can later be promoted to first-class registration.

## Non-goals for v1

- **No dynamic tool registration.** The tools array must stay static across the entire session — any tool added, removed, or mutated after the agent turn-loop starts is a cache-stability regression. See the Rationale section above. This rules out defer-style lazy loading, `directTools` promotion, and any scheme that adds upstream MCP tools to the Pi tools array at runtime.
- **No cache.** `tools/list` on every `mcp_search`/`mcp_describe`. Revisit only if broker round-trip latency becomes a real problem.
- **No tool promotion.** pi-mcp-adapter's `directTools` pattern (registering high-frequency MCP tools as first-class Pi tools with full schema translation) is deferred. Meta-tools are the default; promotion is a future optimization if a specific tool earns the slot — and only if it can be done at extension load time, not mid-session.
- **No `notifications/tools/list_changed` listener.** Always-fresh `listTools()` makes push-based invalidation unnecessary.
- **No unit tests.** Manual smoke + type check.
- **No changes to the broker or broker-cli.** This is a Pi-side change only; broker-cli continues to work for other consumers.

## Out-of-scope follow-ups

- Promoting specific high-frequency tools (e.g. `github.create_pr`) to first-class Pi tools if meta-tool indirection becomes a bottleneck.
- Streaming partial MCP results if the broker ever exposes long-running tools that benefit from incremental updates.
- A slash command like `/mcp-tools` that pretty-prints `tools/list` for the user directly.
