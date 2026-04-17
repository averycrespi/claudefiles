# compact-tools

Pi extension that compacts verbose built-in tool output in the TUI. Execution behavior is unchanged — only the visual rendering is overridden. The full tool output is still delivered to the agent.

## Compacted tools

### `read`

Replaces the default file-contents display with a one-line label.

- **Call:** `read <cwd-relative path>`
- **Running:** `Reading <path>…` in warning color
- **Success:** empty (no result body)
- **Error:** first non-empty line of the error, in error color

Execution is delegated to Pi's built-in `read` tool via `createReadTool(ctx.cwd)`, so all normal read semantics (offset, limit, image handling, truncation) continue to work.

### `bash`

Replaces the default stdout preview with a compact command label and short output tail.

- **Call:** `bash <command>` — multi-line commands show just the first line followed by `…`
- **Running:** `Running <command>…` in warning color
- **Success:** last up to 3 non-empty lines of stdout, in muted color. Nothing if the command produced no output.
- **Error:** first non-empty line of the error (usually the failing command's stderr), in error color

Execution is delegated to Pi's built-in `bash` tool via `createBashTool(ctx.cwd)`, so all normal bash semantics (timeouts, truncation-to-tempfile, abort handling) continue to work.

### `ls`

Replaces the default directory listing with a one-line path label and entry count.

- **Call:** `ls <cwd-relative path>`
- **Running:** `Listing <path>...` in warning color
- **Success:** entry count in muted color (e.g. "23 entries"), or "empty"
- **Error:** first non-empty line of the error, in error color

### `find`

Replaces the default file search output with a one-line pattern label and result count.

- **Call:** `find <pattern> in <path>`
- **Running:** `Finding <pattern>...` in warning color
- **Success:** result count in muted color (e.g. "14 results"), or "no matches"
- **Error:** first non-empty line of the error, in error color

### `grep`

Replaces the default search output with a one-line pattern label and match count.

- **Call:** `grep /<pattern>/ in <path>` (with glob filter if set)
- **Running:** `Searching /<pattern>/...` in warning color
- **Success:** match count in muted color (e.g. "8 matches"), or "no matches"
- **Error:** first non-empty line of the error, in error color

## Testing

This extension has no unit tests of its own. Each per-tool module (`read.ts`, `bash.ts`, `ls.ts`, `find.ts`, `grep.ts`) is a thin wrapper that delegates execution to Pi's built-in tool and routes rendering through a pi-tui `theme` object. The only testable logic is the string shaping that feeds those renderers, and that lives in `../_shared/render.ts` — which is covered by `_shared/render.test.ts`. Adding a parallel test per compact renderer would mostly exercise pi-tui theme stubs rather than any behavior owned here.

## Non-goals

Intentionally out of scope — this is a minimal, hand-rolled subset tailored to this user's setup:

- **No MCP tool rendering.** MCP tools vary too widely to compact generically.
- **No edit / write diff customization.** Pi's built-in diff renderer is already reasonable.
- **No presets, config file, or slash commands.** Behavior is hardcoded.

## Inspiration

- [`pi-tool-display`](https://www.npmjs.com/package/pi-tool-display) — a full-featured extension with compact rendering for all built-in tools, MCP support, adaptive diffs, and configurable presets. `compact-tools` is a deliberately smaller, hand-rolled subset focused on just `read` and `bash`.
