# Autoformat extension

This extension automatically formats files after successful `write` and `edit` tool results.

## Current formatters

- **Go** (`.go`) → `gofmt -w`
- **Prettier-supported files** → `prettier --write --ignore-unknown`

## How it works

The extension listens to `tool_result` events for the built-in `write` and `edit` tools.
After a successful write/edit, it:

1. resolves the target path
2. picks a formatter based on file extension
3. runs the formatter in a per-file mutation queue
4. leaves the original tool result unchanged if formatting fails

## File layout

- `index.ts` — extension entry point and routing
- `gofmt.ts` — Go formatter implementation
- `prettier.ts` — Prettier CLI formatter implementation
- `utils.ts` — shared helpers and types

## Adding another formatter

To add a new formatter later:

1. create a new file, e.g. `rustfmt.ts`
2. export a formatter function from it
3. import and dispatch to it from `index.ts`
4. keep formatter-specific behavior isolated in its own module

## Notes

- Prettier is resolved first from `node_modules/.bin/prettier`
- If that is missing, the extension falls back to `prettier` from `$PATH`
- Unsupported files are ignored
