# mcp-broker

Pi extension that exposes the MCP broker to the agent via three meta-tools (`mcp_search`, `mcp_describe`, `mcp_call`) plus a bash guard that redirects native `gh` and remote-git calls to the broker.

## What it does

- **Meta-tools** — registers `mcp_search`, `mcp_describe`, and `mcp_call`, which share one long-lived MCP client connection to the broker. The agent discovers tools with `mcp_search`, inspects their schemas with `mcp_describe`, and invokes them with `mcp_call`. The upstream broker tool set stays out of the agent's tool list, so the prompt cache prefix stays stable regardless of how many broker tools are discovered.
- **Tool menu in the system prompt** — on `session_start` the extension pre-fetches the broker's tool list. `before_agent_start` injects a per-namespace menu (e.g. `git: git_push, git_pull, …` / `github: gh_list_prs, gh_view_pr, …`) plus a short decision rule into the system prompt. The agent can pick a tool and call `mcp_call` directly without an `mcp_search` round-trip.
- **Guard** — when bash is invoked with direct `gh` or remote git (`push`, `pull`, `fetch`, `ls-remote`, `remote`), the bash still runs but a hint is prepended to its result naming likely broker tools to use next time. Local git is unaffected. Detection is a heuristic; false positives are harmless because nothing is blocked.

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

## Large output spillover

When an `mcp_call` result exceeds **25,000 characters** of joined text, the extension writes the full output to a temporary file and returns a short envelope instead:

```
<persisted-output>
Output too large (47.3 KB / 47312 chars). Full output saved to: `/tmp/pi-mcp-broker/call_abc123.txt`

Preview (first 2 KB):
…

…45312 bytes truncated…

Use the read tool on the path above to fetch the full content.
</persisted-output>
```

File location: `${tmpdir()}/pi-mcp-broker/<toolCallId>.txt`. Files are written with the `wx` flag and left for OS temp-dir reaping; no active cleanup.

**Scope and edge cases:**

- Only `mcp_call` is affected. `mcp_search` and `mcp_describe` outputs are bounded by design and are never spilled.
- Error responses are never spilled — they pass through inline regardless of size.
- Multi-block results: all text blocks are joined and measured together; if the total exceeds the threshold, the joined text is spilled and image blocks are preserved inline.
- Write failure (disk full, permissions): the extension logs a warning and falls back to returning the original content inline rather than failing the tool call.

See `.designs/2026-04-26-mcp-broker-spillover.md` for the full design rationale, envelope format details, and decisions log.

## Guard behavior

When `gh ...` or a remote git operation is detected in bash:

1. Bash runs as the agent requested — nothing is blocked.
2. After the bash result lands, a steering message is queued for the agent. It names up to three likely broker tools (fuzzy-matched from the cached tool list against the bash subcommand) and reminds the agent to use `mcp_call`. One steer per turn at most, so back-to-back matches don't pile up.
3. A UI notification surfaces the hint to the user.

The steer is delivered via `pi.sendMessage` rather than `tool_result` content rewriting because Pi discards `tool_result` content modifications when the underlying tool reports an error — and auth failures (the most common trigger) are exactly that case.

If the broker is unreachable (no cached tool list), the hint falls back to suggesting `mcp_search`. Detection strips quoted substrings before matching, so `git commit -m "fix gh issue"` does not trigger.

## File layout

- `index.ts` — entry point, instantiates `BrokerClient`, wires up tools, guard, and the broker tool menu in the system prompt
- `client.ts` — `BrokerClient` wrapping `@modelcontextprotocol/sdk`'s `StreamableHTTPClientTransport`
- `tools.ts` — `mcp_search`, `mcp_describe`, `mcp_call` definitions
- `spillover.ts` — large-output spill-to-file logic (`joinText`, `buildEnvelope`, `spillIfNeeded`)
- `guard.ts` — bash detection and `tool_result` hint injection

## Inspiration

- [nicobailon/pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) — proxy-tool pattern for exposing an MCP broker to Pi through a minimal set of meta-tools rather than one-tool-per-upstream-tool fan-out. Influenced the decision to go with a small static surface instead of fanning upstream tools into the Pi tool list, and demonstrated the value of making the meta-tool's search/describe path feel first-class.
- Claude Code's `ToolSearch` + `defer_loading` pattern — studied and explicitly not copied. Claude Code accepts prompt-cache invalidation on tool discovery in exchange for context-window savings; this extension optimizes in the other direction (cache stability > per-call token efficiency) because Pi has no API-level `defer_loading` support and our sessions are long-lived.
