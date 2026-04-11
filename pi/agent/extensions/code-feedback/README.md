# code-feedback extension

This extension provides post-write feedback on every successful `write` and `edit` tool result. It runs in two phases:

1. **Autoformat** — runs `gofmt` for `.go` files and `prettier` for files Prettier understands. Identical to the previous `autoformat` extension this replaces.
2. **LSP diagnostics** — for Go and TypeScript/JavaScript files, syncs the post-format content to the language server (gopls or typescript-language-server) and appends any errors to the tool result so the model sees them on its next turn.

## Languages supported

| Language                | Server                               | File extensions                         |
| ----------------------- | ------------------------------------ | --------------------------------------- |
| Go                      | `gopls serve`                        | `.go`                                   |
| TypeScript / JavaScript | `typescript-language-server --stdio` | `.ts .tsx .js .jsx .mjs .cjs .mts .cts` |

Servers are spawned lazily on the first write/edit of a matching file. If a binary isn't installed, the user is notified once per session and Go/TS edits proceed without LSP feedback.

## Tools registered

- `lsp_diagnostics` — explicit diagnostic query for one file or the entire workspace. Returns all severities (errors, warnings, info, hints).
- `lsp_navigation` — definition / references / hover / documentSymbol / workspaceSymbol via LSP.

## File layout

- `index.ts` — extension entry point and orchestration
- `constants.ts` — tunable limits (cap, severities, file size, restarts)
- `timing.ts` — timeout values
- `format/` — gofmt and prettier wrappers (unchanged from `autoformat`)
- `lsp/` — LSP client, manager, file sync, server registry, formatters
- `tools/` — `lsp_diagnostics` and `lsp_navigation` tool definitions

## Adding a new language

Edit `lsp/servers.ts` to add a new entry to `DEFAULT_SERVERS` with:

- `command` and `args` for the language server
- `extensions` (lowercase, with leading dot)
- `rootMarkers` (filenames to walk up from a file's directory looking for the workspace root)
- `installHint` (shown to the user if the binary is missing)

If the LSP `languageId` for the new language differs from the registry key (e.g. JSX/TSX variants), update `lsp/language-map.ts`'s `getLspLanguageId` accordingly.

## Design

See `.designs/2026-04-10-lsp-extension.md` for the full design rationale, including the three landmines that the LSP client handles, the diagnostic acquisition strategy (pull mode + push fallback), and decisions explicitly out of scope for v1.
