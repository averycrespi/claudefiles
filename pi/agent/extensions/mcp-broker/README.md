# mcp-broker

Pi extension that exposes the MCP broker to the agent via three meta-tools (`mcp_search`, `mcp_describe`, `mcp_call`) plus a bash guard that redirects native `gh` and remote-git calls to the broker.

## What it does

- **Meta-tools** — registers `mcp_search`, `mcp_describe`, and `mcp_call`, which share one long-lived MCP client connection to the broker. The agent discovers tools with `mcp_search`, inspects their schemas with `mcp_describe`, and invokes them with `mcp_call`. The upstream broker tool set stays out of the agent's tool list, so the prompt cache prefix stays stable regardless of how many broker tools are discovered.
- **Namespace hint** — on `session_start` the extension pre-fetches the broker's tool list and caches the unique namespace prefixes (e.g. `git`, `github`). `before_agent_start` injects a one-line hint into the system prompt so the agent knows which providers exist without having to probe.
- **Guard** — blocks direct `gh` and remote git (`push`, `pull`, `fetch`, `ls-remote`, `remote`) in bash and steers the agent to use `mcp_call` instead. Local git is unaffected.

## Usage

Typical agent flow:

1. `mcp_search` with a substring query (e.g. `"pr"`, `"git"`, empty string for everything). Returns name + one-line description per match.
2. `mcp_describe` for any candidate that looks right. Returns the full description and JSON Schema for `arguments`.
3. `mcp_call` with the exact name and an arguments object matching the schema.

Tool calls that require human approval block for up to 10 minutes, matching the broker's own approval timeout. After 10 minutes without an approval decision, `mcp_call` returns an error and the agent can retry.

## Configuration

Set these environment variables before starting Pi:

- `MCP_BROKER_ENDPOINT` — base URL of the broker (the extension connects to `${MCP_BROKER_ENDPOINT}/mcp`).
- `MCP_BROKER_AUTH_TOKEN` — bearer token for the broker's MCP endpoint.

If either variable is missing, the meta-tools are still registered, but any call returns a clear configuration error — Pi remains usable on machines without a broker.

## Guard behavior

When `gh ...` or a remote git operation is detected in bash:

1. The bash call is blocked with a short reason.
2. A steering message tells the agent to use `mcp_search` / `mcp_describe` / `mcp_call` with the appropriate provider namespace.
3. A UI notification appears once per turn.

The guard also appends short broker guidance to the system prompt on each turn.

## File layout

- `index.ts` — entry point, instantiates `BrokerClient`, wires up tools, guard, and namespace-hint hook
- `client.ts` — `BrokerClient` wrapping `@modelcontextprotocol/sdk`'s `StreamableHTTPClientTransport`
- `tools.ts` — `mcp_search`, `mcp_describe`, `mcp_call` definitions
- `guard.ts` — bash interception and steering logic

## Inspiration

- [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) — proxy-tool pattern for exposing an MCP broker to Pi through a minimal set of meta-tools rather than one-tool-per-upstream-tool fan-out. Influenced the decision to go with a small static surface instead of fanning upstream tools into the Pi tool list, and demonstrated the value of making the meta-tool's search/describe path feel first-class.
- Claude Code's `ToolSearch` + `defer_loading` pattern — studied and explicitly not copied. Claude Code accepts prompt-cache invalidation on tool discovery in exchange for context-window savings; this extension optimizes in the other direction (cache stability > per-call token efficiency) because Pi has no API-level `defer_loading` support and our sessions are long-lived.
