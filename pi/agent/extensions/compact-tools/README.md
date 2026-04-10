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

## Non-goals

Intentionally out of scope — this is a minimal, hand-rolled subset tailored to this user's setup:

- **No MCP tool rendering.** MCP tools vary too widely to compact generically.
- **No grep / glob / ls compaction.** Not currently enabled in this Pi setup; add if needed.
- **No edit / write diff customization.** Pi's built-in diff renderer is already reasonable.
- **No presets, config file, or slash commands.** Behavior is hardcoded.

## Inspiration

- [`pi-tool-display`](https://www.npmjs.com/package/pi-tool-display) — a full-featured extension with compact rendering for all built-in tools, MCP support, adaptive diffs, and configurable presets. `compact-tools` is a deliberately smaller, hand-rolled subset focused on just `read` and `bash`.
