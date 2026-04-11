# code-feedback — design notes

Durable architectural context for future maintainers. The what/how is in
the code itself and the README; this file captures the why.

## Non-goals for v1

The following are intentionally out of scope. They're all straightforward
to add later, but each adds complexity that wasn't justified for the
initial version:

- **No `.pi-lsp.json` config file** — languages are hardcoded in
  `lsp/servers.ts`. Adding a language is a code change.
- **No tree-sitter fallback** — when LSP is unavailable the extension
  surfaces a clear error instead of degrading to a different engine.
- **No LSP-based formatting** — format stays on the CLI shell-out path
  (`gofmt`, `prettier`). See "Why CLI formatters" below.
- **No auto-install of language servers** — missing `gopls` or
  `typescript-language-server` produces an install hint, not a download.
- **No completions, rename, or code actions** — the `lsp_navigation`
  tool stops at read-only navigation features.
- **No slash commands** — no `/lsp-status`, `/lsp-restart`, etc.

## Why one unified extension (not two)

Format and LSP must run in a specific order on every `write`/`edit`:

1. Autoformat runs first — file bytes may change
2. Content is re-read from disk
3. LSP `didChange` with the post-format content
4. Wait for diagnostics
5. Append errors (if any) to the tool result

If format and LSP lived in separate Pi extensions, the ordering would
depend on Pi's listener invocation order — fragile. A single extension
with one `tool_result` handler sequences them deterministically.

## Why CLI formatters instead of LSP formatting

Every reference implementation reviewed during design (Claude Code,
`pi-lens`, `pi-lsp-extension`) reached the same conclusion. Reasons:

- Not all language servers implement `textDocument/formatting` (tsserver
  mostly doesn't).
- CLI formatters are faster to spawn for one-shot use than booting an
  LSP server just to format.
- The CLI ecosystem (`gofmt`, `prettier`, etc.) is mature and
  well-understood.
- LSP formatting would complicate the `didChange` version chain since
  the formatter would mutate bytes behind the tracker's back.

## Lazy-start with return-null

When the model edits a file whose language server isn't running yet,
the orchestrator kicks off `startServer` in the background and
immediately returns — the model gets its tool result back instantly
with no LSP output. From the next edit onwards, the server is warm
and diagnostics appear normally.

This means the very first edit in a session never sees LSP errors.
Acceptable for our use case: the model is unlikely to make a critical
error on the first file it touches, and subsequent edits (or an
explicit `lsp_diagnostics` call) catch it. The alternative — blocking
the tool result for up to 10 seconds while tsserver warms up — would
be much worse.

Note that the explicit `lsp_diagnostics` tool uses a different policy:
if the model asked for diagnostics directly, it blocks with a timeout
(`EXPLICIT_TOOL_BLOCK_TIMEOUT_MS`) rather than silently returning
empty. That's appropriate because the model is asking on purpose.

## Diagnostic acquisition: pull with push fallback

LSP 3.17 added `textDocument/diagnostic` as a synchronous
request/response: the client asks "are you done? what are the errors?"
and the server responds when its analysis is complete. Both `gopls` and
`typescript-language-server` support it, so that's the preferred path.

For language servers that don't advertise `diagnosticProvider`, we fall
back to the traditional `publishDiagnostics` notification model with
a debounce (catch the syntax pass followed by the semantic pass) and
a hard cap (never wait forever). The push-mode strategy:

- Wait up to `PUSH_FIRST_NOTIFICATION_TIMEOUT_MS` for any
  `publishDiagnostics` to arrive for this URI
- Once one arrives, debounce `PUSH_DEBOUNCE_MS` to catch the semantic
  follow-up pass
- Never exceed `PUSH_HARD_TIMEOUT_MS` total
- Return whatever's in the diagnostic cache

Exact values are in `timing.ts` with reasoning in the JSDoc comments.

## Error surfacing policy

**Auto-inject (after every write/edit): errors only.** Warnings, info,
and hints are explicitly excluded. The reasoning — and how to re-enable
warnings if you change your mind — is documented in detail on
`AUTO_INJECT_SEVERITIES` in `constants.ts`.

**Explicit `lsp_diagnostics` tool: all severities.** When the model is
asking on purpose it wants the full picture.

**Missing-binary / crashed-too-often: silent in auto-inject.** If the
model edits a Go file and `gopls` isn't installed, we don't append
"gopls not installed" to every Go edit — that's context spam the
model can't act on. The user sees a one-time notification and a status
line indicator; the model finds out only if it explicitly calls
`lsp_diagnostics` or `lsp_navigation`.

## Server lifecycle and restart policy

Each `(language, workspace-root)` pair has one of six states:

- `not-started` — no server spawned yet
- `starting` — spawn in progress
- `running` — initialized and serving requests
- `missing-binary` — ENOENT on spawn (permanent for session)
- `broken` — spawn failed or server crashed (cooldown + retry)
- `crashed-too-often` — exceeded `MAX_RESTARTS_PER_SESSION` (permanent)

`missing-binary` is explicitly distinct from `broken` because ENOENT
means the binary literally doesn't exist on disk — retrying won't
change that. `broken` has a 15-second cooldown because its failures
are often transient (server was indexing, hit a file watcher limit,
etc.). After 3 failed restarts the state latches to `crashed-too-often`
and stays there for the session.

Mid-session crashes are observed via an `onCrash` callback the client
calls from its `proc.on("exit")` handler, which transitions the
manager's state from `running` to `broken`. Without this wire-up, a
dead client would stay in `running` and the next edit would hand out
a corpse.

## Crash hygiene: the three landmines

The LSP client (`lsp/client.ts`) implements three defensive patterns
that are mandatory when spawning a subprocess that talks JSON-RPC over
stdio. Skipping any of them produces random host crashes weeks into
use. Each is documented with a detailed inline comment in `client.ts`,
but a summary:

1. **`stdin.write` monkey-patch** — guards against two distinct
   failure modes: (a) writes to an already-unwritable stream are
   no-oped instead of throwing, and (b) mid-write EPIPE / ECONNRESET
   / ERR_STREAM_DESTROYED errors are intercepted in the write
   callback and reported as successful writes, because otherwise
   vscode-jsonrpc's internal write promise rejects and the
   rejection propagates as an unhandled rejection that kills the
   host. The naive `stdin.destroyed` check alone is not enough —
   the OS pipe can be broken before Node has marked the local
   stream as destroyed.
2. **Permanent stream `error` listeners** attached before
   `createMessageConnection` — catches the `EPIPE` / `ECONNRESET` /
   `ERR_STREAM_DESTROYED` window between `connection.dispose()` and
   `process.kill()`.
3. **`await` the `spawn` event** before writing to stdin — `ENOENT`
   fires asynchronously and would otherwise crash the host when the
   binary is missing. The spawn-await step produces the tagged
   `SpawnError` that the manager uses to distinguish missing-binary
   from other failures.

## Reference implementations

The design was informed by studying three prior art projects, each of
which independently converged on many of the same patterns:

- **Anthropic Claude Code** — `vscode-jsonrpc` based, plugin-driven
  server discovery, pull-mode preferred, diagnostics delivered as
  attachments. Source: the bundled JS distribution.
- **`apmantza/pi-lens`** — large Pi extension with 41 hardcoded LSP
  servers, debounced `publishDiagnostics`, production-grade error
  handling. Particularly valuable for the debounce pattern and the
  permanent stream listener technique.
- **`samfoy/pi-lsp-extension`** — smaller Pi extension using
  `vscode-languageserver-protocol`, lazy-start with return-null
  pattern, LRU(100) document tracking. The `stdin.write` monkey-patch
  came from this project.

All three surface diagnostics by appending to `tool_result.content`
rather than overriding built-in tools. We do the same.
