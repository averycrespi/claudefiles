# code-feedback extension

This extension surfaces LSP feedback to the model without making the model ask for it. After every successful `write` or `edit` tool result it runs two phases:

1. **Autoformat** — runs `gofmt` for `.go` files and `prettier` for files Prettier understands. Identical to the previous `autoformat` extension this replaces.
2. **LSP diagnostics** — for Go and TypeScript/JavaScript files, syncs the post-format content to the language server (gopls or typescript-language-server) and appends any errors to the tool result so the model sees them on its next turn.

It also piggybacks on `read` tool results: when the model reads a file the LSP already knows about (from a prior write/edit or explicit LSP tool call), cached diagnostics are appended to the read result so the model is reminded of latent errors even after the original auto-inject has scrolled out of its context. The read path is strictly a cache lookup — it never opens files or issues LSP requests, preserving the "reads are cheap" contract.

## Languages supported

| Language                | Server                               | File extensions                         |
| ----------------------- | ------------------------------------ | --------------------------------------- |
| Go                      | `gopls serve`                        | `.go`                                   |
| TypeScript / JavaScript | `typescript-language-server --stdio` | `.ts .tsx .js .jsx .mjs .cjs .mts .cts` |

Servers are spawned lazily on the first write/edit of a matching file. If a binary isn't installed, the user is notified once per session and Go/TS edits proceed without LSP feedback.

## Tools registered

- `lsp_diagnostics` — explicit diagnostic query for a single file. Returns all severities (errors, warnings, info, hints). For whole-project checks, run the project's own compiler via bash (`tsc --noEmit`, `go build ./...`, `go vet ./...`) — faster and more complete than anything the LSP can offer at workspace scope.
- `lsp_navigation` — definition / references / hover / documentSymbol / workspaceSymbol via LSP.

Both tools install compact TUI renderers (`renderCall` / `renderResult`)
that mirror the `compact-tools` extension pattern. The model still sees
the full tool output — semantic results are never truncated for the LLM
— but the TUI shows a one-line summary like `42 references`, `4 errors,
2 warnings`, or the first line of a hover, so a large navigation result
doesn't blow out the footer with 40+ lines of symbols.

## File layout

- `index.ts` — extension entry point and orchestration
- `constants.ts` — tunable limits (cap, severities, file size, restarts)
- `timing.ts` — timeout values
- `log.ts` — UI-aware logging helper (see "Logs" below)
- `format/` — gofmt and prettier wrappers (unchanged from `autoformat`)
- `lsp/` — LSP client, manager, file sync, server registry, formatters
- `tools/` — `lsp_diagnostics` and `lsp_navigation` tool definitions, plus `render.ts` (compact TUI renderers)

## Logs

When Pi is running in interactive TUI mode, diagnostic messages from this
extension — language server stderr, connection lifecycle events, crash
reports — are appended to:

```
~/.pi/logs/code-feedback.log
```

Writing to `stdout`/`stderr` directly would corrupt the TUI's footer and
status-line rendering, so the extension routes everything through a
small logger (`log.ts`) that falls back to `console.error` only in
non-interactive modes (`--mode json`, `--mode rpc`, `-p`).

If an LSP server is misbehaving and the error surfaced via `lsp_diagnostics`
isn't enough, `tail -f ~/.pi/logs/code-feedback.log` is the place to look.

## Adding a new language

Edit `lsp/servers.ts` to add a new entry to `DEFAULT_SERVERS` with:

- `command` and `args` for the language server
- `extensions` (lowercase, with leading dot)
- `rootMarkers` (filenames to walk up from a file's directory looking for the workspace root)
- `installHint` (shown to the user if the binary is missing)

If the LSP `languageId` for the new language differs from the registry key (e.g. JSX/TSX variants), update `lsp/language-map.ts`'s `getLspLanguageId` accordingly.

## Design

See [`DESIGN.md`](DESIGN.md) for the architectural context: non-goals for v1, why the extension is unified, why formatting stays on CLI tools, the lazy-start pattern, the diagnostic acquisition strategy (pull mode + push fallback), the server state machine, and the three crash-avoidance landmines in the LSP client.
