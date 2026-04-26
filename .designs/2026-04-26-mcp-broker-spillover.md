# MCP Broker Large-Output Spillover

**Date:** 2026-04-26
**Status:** Design approved, pending implementation

## Problem

The MCP broker can return large payloads — `gh_diff_pr` on a sizable PR, `gh_list_*` with many results, `gh_view_pr` with long bodies and comments. When dumped inline into the agent's context, these payloads pollute the conversation, eat token budget, and (for subagents on smaller-context models) can crowd out the actual task.

We want a "spill to file" mechanism: when an `mcp_call` result exceeds a size threshold, write the payload to a file and return a short envelope (path + size + preview) so the agent can `read` the file on demand instead of carrying the full payload in context.

## Goals

1. `mcp_call` results over a threshold are persisted to disk and the agent receives a short envelope referencing the file.
2. The envelope works well for both Claude (parent agent) and GPT-5.x (subagents).
3. The mechanism is opt-out-by-not-triggering: results under the threshold behave exactly as today.
4. No surprises for callers — failures fall back gracefully to inline returns.

## Non-goals (YAGNI)

- Per-message budget across parallel tool calls. Pi rarely runs broker calls in parallel within a single turn.
- Configurable threshold via env var. Defer until someone needs to tune it.
- Active cleanup of the spillover directory. OS reaping is sufficient.
- Spillover for non-`mcp_call` tools. The broker is the acute pain; other tools can opt in later via a shared helper if needed.
- Per-tool override via MCP `_meta` annotations (Claude Code's `anthropic/maxResultSizeChars`). Would require broker-server changes; revisit if specific tools need different limits.

## Design

### Section 1 — Scope

Lives entirely inside `mcp-broker`. Specifically, the `mcp_call` tool's `execute` path in `tools.ts`. No changes to `mcp_search`/`mcp_describe` (their outputs are bounded by design), no changes to other extensions, no changes to Pi core.

### Section 2 — Threshold

**25,000 characters** of joined text content per `mcp_call` result.

Rationale: aggressive but safe. Catches typical large GitHub responses (PR diffs, issue lists) before they pollute even small subagent contexts. Half of Claude Code's 50K default — appropriate because Pi subagents often run on tighter context budgets than the main agent.

Hardcoded constant; no env-var override in v1.

### Section 3 — Storage

```
${tmpdir()}/pi-mcp-broker/<toolCallId>.{txt|json}
```

- Flat layout, no session subdirectory.
- `<toolCallId>` is unique per invocation; collision-free.
- Extension chosen by content shape: `.txt` for plain text (the common case for broker results), `.json` only if we ever serialize structured array content (not in v1).
- Written with `wx` flag for idempotency.
- No active cleanup. OS tmpdir reaping (reboot, `tmpwatch`) handles it.
- Matches the existing pattern in `subagents/spawn.ts:170` (`LOG_DIR` under tmpdir).

### Section 4 — Envelope format

When a result exceeds the threshold, the text content is replaced with a single text block containing:

```
<persisted-output>
Output too large (47.3 KB / 47312 chars). Full output saved to: `/tmp/pi-mcp-broker/call_abc123.txt`

Preview (first 2 KB):
<first 2000 chars of joined text>

…45312 bytes truncated…

Use the read tool on the path above to fetch the full content.
</persisted-output>
```

Design choices:

- **`<persisted-output>` XML wrapper.** Familiar to Claude (Claude Code uses identical tag). OpenAI's GPT-5/5.1/5.2 prompting guides explicitly recommend XML for structured prompt sections, so it lands well for GPT-5.4/5.5 subagents too.
- **Backtick-wrapped path.** OpenAI's GPT-5 prompting guide explicit rule for file paths. Harmless for Claude.
- **`…N bytes truncated…` marker.** Codex's house style for truncated output (`codex-rs/utils/string/src/truncate.rs`). Familiar to GPT models; harmless for Claude.
- **Head-only preview, 2 KB.** Matches Claude Code; simpler than head+tail. Broker results are most informative at the top.
- **Closing instruction.** Tells the agent exactly what to do — use the `read` tool. No ambiguity.

### Section 5 — Multi-block content handling

`mcp_call` returns `content: [{type, text|image, ...}, ...]`. Strategy:

1. Aggregate all text blocks (joined with `\n`) and measure total length.
2. If total ≤ 25,000 chars: return content unchanged (current behavior).
3. If total > 25,000 chars: write the joined text to a file; replace all text blocks in `content` with a single envelope text block; pass image blocks through inline.
4. If joined text is empty (all blocks are images): no spillover, return as-is.

### Section 6 — Failure handling

If `writeFile` rejects (disk full, permissions, etc.): catch the error, log a `console.warn`, return the original (inline) content. Better to overflow context than to fail a tool call the agent depended on.

### Section 7 — Tool result `details` field

Spillover augments the existing `details` payload so the TUI renderer and session reconstruction can show the metadata cleanly:

```ts
details: {
  name: params.name,
  brokerError,
  spilled: true,             // new
  spillFilePath: "/tmp/...", // new
  originalSize: 47312,       // new
}
```

When `spilled` is false/undefined, behavior is identical to today.

### Section 8 — TUI rendering

`renderResult` in `tools.ts` already shows the first 3 non-empty lines of the result text. The envelope's first line is the "Output too large…" line, so spillover state is visible in the footer naturally. No renderer changes required in v1; a minor polish (e.g. "(spilled to file)" badge) can come later if useful.

### Section 9 — Tests

New file `mcp-broker/spillover.test.ts`:

- Below threshold → returns content unchanged.
- Above threshold → writes file, returns envelope, `details.spilled === true`.
- Envelope path matches `details.spillFilePath`.
- Multi-block text input → blocks joined with `\n` before measuring and writing.
- Image blocks pass through; text spilled.
- Empty text content (image-only) → no spillover.
- `writeFile` rejects → falls back to inline content, no envelope, no `spilled` flag.
- Preview truncated at 2,000 bytes; `…N bytes truncated…` marker shows the correct byte count.

### Section 10 — Rollout

Single PR. The change is self-contained to `mcp-broker` and strictly additive — pre-spillover behavior is preserved for results under 25K chars. Easy to revert if it causes issues.

## Decisions log

- **Scope:** `mcp_call` only. Not generic Pi tool_result hook; not `mcp_search`/`mcp_describe`.
- **Threshold:** 25,000 characters. Hardcoded; no env-var override in v1.
- **Storage:** `${tmpdir()}/pi-mcp-broker/<toolCallId>.{txt|json}`, flat layout, no active cleanup.
- **Envelope:** `<persisted-output>` XML tags; backtick-wrapped path; head-only 2 KB preview; Codex-style `…N bytes truncated…` marker; closing instruction to use the `read` tool.
- **Multi-block:** aggregate text, spill all if over threshold, preserve images inline.
- **Failure mode:** `writeFile` failure falls back to inline return + warn log.

## Research references

- Claude Code's spillover mechanism: per-tool default 50K chars, per-message budget 200K chars, files at `{projectDir}/{sessionId}/tool-results/{toolCallId}.{json|txt}`, `<persisted-output>` envelope. (`/src/utils/toolResultStorage.ts`, `/src/constants/toolLimits.ts`)
- MCP spec: no convention for size handling; purely client-side practice. Two camps in the wild — tight (10–32 KB, Codex 10 KiB) vs. loose (256–512 KB).
- OpenAI prompting guides explicitly recommend XML for structured prompt sections (GPT-5/5.1/5.2 cookbook).
- Codex CLI's truncation idiom: `Total output lines: N\n\n{head}…N tokens truncated…{tail}` — informed the marker wording.
- OpenAI Codex issue [#14206](https://github.com/openai/codex/issues/14206) — open feature request for exactly this design pattern; no shipped OpenAI convention to copy.
