# autoformat extension

Runs a formatter against every file the agent writes or edits:

- `.go` files → `gofmt -w`
- everything Prettier understands → `prettier --write --ignore-unknown` (prefers `node_modules/.bin/prettier`, falls back to `$PATH`)

If the relevant binary isn't installed, the failure is surfaced as a one-time TUI warning and the edit proceeds unchanged.

## History

This extension was split out of the archived `code-feedback` extension, which combined autoformatting with LSP diagnostic auto-injection. The LSP half was dropped (see `pi/archive/extensions/code-feedback/DESIGN.md` for why); this extension keeps only the formatting path.
