# TUI rendering for pi extensions

Most tools we add to pi implement `renderCall` and `renderResult` to
produce compact output for the footer instead of dumping raw results.
We've converged on a specific shape — match it unless there's a clear
reason not to. `compact-tools`, `mcp-broker`, and `subagents` are the
working reference.

Shared helpers live in `pi/agent/extensions/_shared/render.ts` — import
from there via `../_shared/render.js` rather than reimplementing
`firstLine`, `formatDuration`, and friends. The `_shared/` directory
has no `index.ts`, so pi's extension loader skips it; do not add one.

## renderCall: one-line header

Format: `{bold toolTitle: name} {accent: primary id} {muted/dim: context}`

```typescript
renderCall(args, theme, context) {
  const header = theme.fg("toolTitle", theme.bold("my_tool"));
  const target = theme.fg(
    "accent",
    getRelativeLabel(context.cwd, args?.path),
  );
  return new Text(`${header} ${target}`, 0, 0);
}
```

- **Primary identifier** = the one thing worth seeing at a glance — file
  path, command, query, target tool name.
- **Secondary context** in `muted` or `dim` — arg keys `(a, b, c)`,
  `:line:col`, operation label, count flags.
- **Degrade gracefully** when args are still streaming. Fall back to
  `theme.fg("muted", "(missing name)")` instead of rendering nothing.
- Return a single `Text`. Multi-line headers are reserved for tools
  that genuinely list things (`ask_user`, `spawn_agents`).
- When the operation itself is the primary discriminator (as in
  `lsp_navigation`), the operation label may come before the accent
  target — the `{bold} {accent} {muted}` order is a guideline, not
  a law.

## renderResult: three states, always

Every renderer must handle `isPartial`, `context.isError`, and success.

### 1. Partial (in progress)

Single-line `warning` status with a concrete subject from `context.args`,
plus an elapsed counter via `partialElapsed(context)`:

```typescript
if (isPartial) {
  const cmd = singleLineCommand(context.args?.command);
  return new Text(
    theme.fg("warning", `Running ${cmd}...${partialElapsed(context)}`),
    0,
    0,
  );
}
clearPartialTimer(context);
```

- Use `...` (three dots), not `…`.
- Include the subject — "Querying diagnostics..." beats "Querying...".
- `partialElapsed(context)` records `state.startedAt` on first call,
  starts a 1s redraw ticker, and returns `" (1m 03s)"` once elapsed
  crosses `ELAPSED_THRESHOLD_MS` (2s). Before the threshold it returns
  the empty string so fast calls don't flash `"(0s)"`.
- **Always** call `clearPartialTimer(context)` before returning from
  the error or success branches — otherwise the ticker leaks past the
  tool's lifetime.
- For long-running structured progress (parallel subagents), render a
  `muted` multi-line tree instead of a one-line warning. Use
  `startPartialTimer(context)` / `clearPartialTimer(context)` directly
  — you'll be rendering elapsed time inside the tree yourself, so
  `partialElapsed` isn't the right primitive. See `subagents/index.ts`.

### 2. Error

One-liner in `theme.fg("error", ...)`:

```typescript
if (context.isError) {
  clearPartialTimer(context);
  return new Text(
    theme.fg("error", firstLine(getResultText(result)) || "my_tool error"),
    0,
    0,
  );
}
```

If `execute` prepended a marker block to the error text (as `mcp_call`
does for broker errors), peel it off before displaying so the user
sees the underlying message, not the marker.

### 3. Success

Compact `muted` summary. The goal is to show the user enough that they
can tell _what came back_ at a glance — a bare "1 line" or "42 lines"
count is almost never the right answer, it tells the reader nothing
about whether the tool did the right thing. Pick the shape that fits:

- **Head of N lines** — first ~3 non-empty lines of the result, with
  `... +M more lines` appended when there's more. This is the default
  for data-returning tools (broker calls, list responses, structured
  output) because the meaningful result is almost always near the top.
  See `mcp_call`.
- **Tail of N lines** — last ~3 non-empty lines. Use for streamed
  output where the end is what matters (command logs, build output).
  See `bash`.
- **Count summary** — `"3 references"`, `"2 errors, 1 warning"`,
  `"5 matches of 142 tools"`. Use when the count _is_ the answer —
  LSP references, diagnostic counts, search hit counts — not as a
  fallback when you couldn't be bothered to show a snippet. Stash
  counts in `details` from `execute` and read them here rather than
  re-parsing the result text.
- **First-line preview** — when the first line is itself a good
  summary (e.g. a hover signature, a definition location) and the
  remaining lines are noise. Use `FIRST_LINE_INLINE_MAX` (80 chars) as
  the cutoff if you need to guard against pathological lengths.
- **Empty** — when the call header already conveys everything (the
  compact `read` override renders nothing on success).

Use `headNonEmptyLines(text, N)` / `tailNonEmptyLines(text, N)` from
`_shared/render.ts` to build snippet summaries.

Reserve `success`-colored output for interactive resolutions like
`ask_user`'s "✓". Regular tool completions stay `muted` so the log is
scannable.

## Non-negotiables

- **Never dump full output** in `renderResult`. Show a head / tail
  snippet (~3 lines) or a meaningful count, not the whole result.
- **Never substitute a bare line count for a snippet.** "1 line" is
  less useful than showing that line. Counts are only right when the
  count itself is the answer.
- `renderResult` reads args from `context.args`, not the raw call.
- `renderCall` / `renderResult` are display-only — `execute` still
  returns the full result for the model.
- Always call `clearPartialTimer(context)` in every non-partial
  branch if you used `partialElapsed` or `startPartialTimer`.

## Shared helpers (`_shared/render.ts`)

Constants:

- `ELAPSED_THRESHOLD_MS` (2000) — threshold below which
  `partialElapsed` returns `""`.
- `FIRST_LINE_INLINE_MAX` (80) — first-line preview cutoff.

Text helpers:

- `firstLine(text)` — first non-empty line or `""`.
- `getResultText(result)` — pull the text block from
  `AgentToolResult.content`.
- `getRelativeLabel(cwd, path)` — cwd-relative path label with
  `@`-prefix and boundary handling.
- `countNonEmptyLines(text)` — for count summaries.
- `plural(n, "reference")` — `"1 reference"` / `"3 references"`.
- `singleLineCommand(cmd)` — collapse multi-line bash commands.
- `headNonEmptyLines(text, n)` — first N non-empty lines; use for
  head-snippet success summaries (broker calls, list responses).
- `tailNonEmptyLines(text, n)` — last N non-empty lines; use for
  tail-snippet success summaries (command output, logs).

Duration / timer helpers:

- `formatDuration(ms)` — `"5s"` or `"1m 03s"`.
- `partialElapsed(context)` — the one-liner elapsed suffix. Use this
  in single-line warning renderers.
- `startPartialTimer(context)` — register the 1s redraw ticker
  without recording `startedAt` or returning a suffix. Use this when
  rendering elapsed time yourself (structured progress views).
- `clearPartialTimer(context)` — clear the ticker. Always call in
  the non-partial branches.
