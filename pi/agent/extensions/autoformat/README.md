# autoformat

Pi extension that formats files after every successful `write` or `edit`.

## Formatters

- `.go` files → `gofmt -w`
- everything Prettier understands → `prettier --write --ignore-unknown` (prefers `node_modules/.bin/prettier`, falls back to `prettier` on `$PATH`)

## Behavior

- Each write/edit is queued through `withFileMutationQueue`, so concurrent edits to the same file format in order rather than racing.
- Formatter failures never block the edit. Errors are surfaced as a TUI warning (or stderr in headless mode) and the original written content is left in place.
- A missing formatter binary (`ENOENT`) is silent — no warning, no error. Install gofmt/prettier separately if you want them to run.

## Non-goals

This extension only handles formatting. LSP diagnostics, when needed, should be polled via explicit tools, not pushed into tool results.
