# LSP Extension Design

**Date:** 2026-04-10
**Status:** Approved for implementation
**Supersedes:** Existing `pi/agent/extensions/autoformat/` (will be expanded)

## Goal

Expand the existing `autoformat` Pi extension into a unified `code-feedback`
extension that:

1. Keeps the existing autoformat behavior (gofmt, prettier) on every successful
   `write`/`edit`.
2. Adds Language Server Protocol integration so the model gets compile/type
   errors as feedback after every edit.
3. Exposes LSP navigation features (definition, references, hover, document
   symbols, workspace symbols) as agent-callable tools.
4. Ships with built-in support for **Go (gopls)** and **TypeScript/JavaScript
   (typescript-language-server)**, structured so additional languages are a
   small code change later.

## Background

The existing `autoformat` extension shells out to `gofmt`/`prettier` after
`write`/`edit` tool results. It's small (~70 lines), self-contained, and works
well. We want to keep that behavior and add LSP feedback alongside it.

Three reference implementations were studied in detail before this design:

- **Claude Code** (`~/Workspace/claude-code/src/services/lsp/`) — uses
  `vscode-jsonrpc`, plugin-based server discovery, attachment system for
  diagnostics, supports navigation features as a tool.
- **apmantza/pi-lens** — large pi-mono extension; spawns 41 hardcoded LSP
  servers, debounces `publishDiagnostics`, appends diagnostics to
  `tool_result.content`. Notable for its production-grade error handling.
- **samfoy/pi-lsp-extension** — smaller pi-mono extension; uses
  `vscode-languageserver-protocol`, lazy-start with return-null pattern,
  LRU(100) document tracking, tree-sitter fallback.

## Non-goals (v1)

- **No `.pi-lsp.json` config file.** Languages and server commands are
  hardcoded in `lsp/servers.ts`. Adding a language is a code change.
- **No tree-sitter fallback.** When LSP is unavailable, we surface a clear
  error rather than degrading to a different engine.
- **No LSP-based formatting.** Formatting stays on the existing CLI shell-out
  path (gofmt, prettier). All three reference projects also avoid LSP
  formatting.
- **No auto-install of language servers.** If `gopls` is missing, we surface
  an install hint and the user installs it themselves.
- **No completions, rename, or code actions.** These add significant
  complexity for marginal value at this stage.
- **No slash commands** for LSP configuration. Hardcoded defaults are
  sufficient until we have a real reason to change them at runtime.

## Architecture

### Single unified extension

The existing `autoformat/` directory is renamed to `code-feedback/` and grows
an `lsp/` subdirectory. The `index.ts` orchestrates a single sequenced flow
inside one `tool_result` listener:

```
tool_result (write/edit) →
  1. autoformat (gofmt or prettier — file bytes may change)
  2. re-read file content from disk
  3. LSP didChange with the new (post-format) content
  4. wait for diagnostics (pull mode if supported, push fallback otherwise)
  5. filter to errors only, cap to MAX_INLINE_ERRORS_PER_FILE
  6. append summary to event.content
```

**Why one extension instead of two:** if `format` and `lsp` were separate
extensions both listening on `tool_result`, the order in which Pi invokes
listeners would determine correctness — the LSP needs to see post-format
bytes, not pre-format. A single extension sequences them deterministically.

### Directory layout

```
pi/agent/extensions/code-feedback/
├── package.json              # vscode-languageserver-protocol dep
├── index.ts                  # tool_result orchestrator + tool registration
├── constants.ts              # MAX_INLINE_ERRORS_PER_FILE, severity set, etc.
├── timing.ts                 # all timeout constants
├── format/
│   ├── gofmt.ts              # moved from autoformat/, unchanged
│   ├── prettier.ts           # moved from autoformat/, unchanged
│   └── utils.ts              # moved from autoformat/, unchanged
├── lsp/
│   ├── client.ts             # JSON-RPC client wrapper, stdio transport
│   ├── manager.ts            # per-language lifecycle + state machine
│   ├── file-sync.ts          # LRU(100) document tracking
│   ├── servers.ts            # DEFAULT_SERVERS map (gopls, tsserver)
│   ├── language-map.ts       # extension → languageId lookup
│   └── diagnostics.ts        # pull-mode + push-fallback waiting logic
└── tools/
    ├── lsp-diagnostics.ts    # explicit lsp_diagnostics tool
    └── lsp-navigation.ts     # explicit lsp_navigation tool
```

## Tech stack

- **`vscode-languageserver-protocol`** (single npm dep) — re-exports
  `vscode-jsonrpc` for transport and provides typed LSP types. Pi-lsp-extension
  uses this; pi-lens uses both as separate deps. We pick the single dep to
  avoid version skew. ~50 lines of real code gets a working JSON-RPC client.
- **`vscode-jsonrpc/node.js`** for `StreamMessageReader` / `StreamMessageWriter`
  / `createMessageConnection`. Comes transitively from the above.
- **Node `child_process`** for spawning LSP servers. stdio transport only.

## Server registry

Hardcoded in `lsp/servers.ts`. v1 has exactly two entries:

```ts
export interface ServerConfig {
  command: string;
  args: string[];
  extensions: string[]; // file extensions this server handles
  rootMarkers: string[]; // walk up from file looking for these
  installHint: string; // shown to user if binary missing
}

export const DEFAULT_SERVERS: Record<string, ServerConfig> = {
  go: {
    command: "gopls",
    args: ["serve"],
    extensions: [".go"],
    rootMarkers: ["go.mod", "go.work"],
    installHint: "Install: go install golang.org/x/tools/gopls@latest",
  },
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
    rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
    installHint:
      "Install: npm install -g typescript-language-server typescript",
  },
};
```

JavaScript files map to the same `typescript` entry — `typescript-language-server`
handles both languages.

`language-map.ts` builds a `Map<extension, languageId>` once at startup by
walking `DEFAULT_SERVERS`. **Last-write-wins** for duplicate extensions; this
shouldn't happen in v1 but is documented behavior.

`rootMarkers` are walked from the file's directory upward. The first marker
hit determines the workspace root for that file. Per-file roots mean a Go
monorepo with multiple `go.mod` files gets one gopls instance per module.

## Lifecycle and state machine

Each language ID has one of these states inside `LspManager`:

```ts
type ServerState =
  | { kind: "not-started" }
  | { kind: "starting"; promise: Promise<LspClient> }
  | { kind: "running"; client: LspClient; restarts: number }
  | { kind: "missing-binary"; command: string } // ENOENT — permanent
  | { kind: "broken"; error: Error; cooldownUntil: number; restarts: number }
  | { kind: "crashed-too-often"; error: Error }; // exceeded MAX_RESTARTS
```

### Lazy start with return-null

Servers start on the **first write/edit** of a matching file, not on `read`.
Reading shouldn't spin up servers — that wastes resources when the model is
just browsing.

`LspManager.getRunningClient(languageId)` returns the client only if state
is `running`. If state is `not-started`, it kicks off `startServer()` in the
background, transitions to `starting`, and **returns `null` immediately**.
The caller gets no LSP feedback for this tool result; the next write/edit
will get it.

This means the first edit in a session never blocks waiting for gopls/tsserver
to boot. The model gets its tool result back instantly.

For the **explicit `lsp_diagnostics` tool**, the behavior is different:
because the model is asking for diagnostics specifically, we **block with a
timeout** rather than returning empty. If the server isn't ready within the
explicit-tool timeout, we return a clear "still starting" message.

### State transitions

- `not-started` → `starting` (on first matching file edit)
- `starting` → `running` (on successful spawn + initialize)
- `starting` → `missing-binary` (on ENOENT during spawn)
- `starting` → `broken` (on any other spawn/init failure)
- `running` → `broken` (on `process.on("exit")` or `connection.onClose`)
- `broken` → `starting` (after `cooldownUntil`, if `restarts < MAX_RESTARTS_PER_SESSION`)
- `broken` → `crashed-too-often` (when `restarts >= MAX_RESTARTS_PER_SESSION`)

`missing-binary` is permanent for the session. ENOENT means the binary isn't
on disk; retrying won't change that. This is explicitly distinct from
`broken` (which has a 15s cooldown for transient failures).

`crashed-too-often` is permanent for the session. After 3 restarts, we
assume the server is fundamentally broken and stop trying. The user is
notified via `ctx.ui.notify` and the status line.

## Diagnostic acquisition

Two strategies. The client picks based on server capability declared in
`InitializeResult`.

### Pull mode (preferred — gopls and tsserver both support)

LSP 3.17+ introduced `textDocument/diagnostic` as a request/response. After
sending `didChange`, we send a `textDocument/diagnostic` request. The server
holds the response until its analysis is complete and then responds with the
diagnostic list.

**No timing guesswork.** We get a clean answer when the server is ready.

Hard timeout: `PULL_MODE_HARD_TIMEOUT_MS = 5000`. Safety net for hung servers,
not a normal-operation deadline.

### Push fallback (for any custom server that doesn't advertise diagnosticProvider)

Traditional `publishDiagnostics` notifications. The client maintains a
`Map<uri, Diagnostic[]>` updated by an `onNotification` handler. To know
when to read from this map, we use **debounce + first-notification timeout**:

```
sendNotification("textDocument/didChange", { ... });

await waitForDiagnostics(uri, {
  firstNotificationTimeoutMs: 1500,   // wait up to 1.5s for ANY notification
  debounceMs: 150,                     // after first, wait 150ms for follow-ups
  hardCapMs: 2000,                     // absolute max
});

return diagnosticsCache.get(uri) ?? [];
```

Per-URI `EventEmitter` (set max listeners high enough — pi-lens uses 50)
emits when the debounce settles. Multiple concurrent waiters for the same
URI all resolve from the same emit.

If no notification ever arrives within 1500ms (clean file on a server that
doesn't bother sending empty diagnostics), we return whatever's in the cache
(typically empty).

### Tunable constants

All in `code-feedback/timing.ts`:

```ts
export const PULL_MODE_HARD_TIMEOUT_MS = 5000;
export const PUSH_FIRST_NOTIFICATION_TIMEOUT_MS = 1500;
export const PUSH_DEBOUNCE_MS = 150;
export const PUSH_HARD_TIMEOUT_MS = 2000;
export const EXPLICIT_TOOL_BLOCK_TIMEOUT_MS = 10000; // for lsp_diagnostics when starting
```

## Document tracking

`file-sync.ts` maintains an LRU map bounded to `MAX_TRACKED_DOCUMENTS = 100`.
Each entry is `{ uri, languageId, version }`.

- **First write/edit of a file**: send `didOpen` with `version: 1`, add to LRU.
- **Subsequent writes/edits**: increment version, send `didChange` with full
  content (no incremental sync — simpler and correct, slower for huge files).
- **LRU eviction at 101 documents**: send `didClose` for the evicted URI.
- **Reads do not open files in LSP.** This is critical — the model browsing
  files shouldn't trigger LSP opens. Only writes/edits do.

Full-content sync (always send the entire file) is simpler than incremental
and matches both pi-lens and pi-lsp-extension. Acceptable performance for
sane file sizes.

**File size guard**: skip LSP entirely for files over `LSP_MAX_FILE_BYTES`
(start at 1 MB). Format still runs; LSP just doesn't bother. Avoids sending
huge generated files through tsserver.

## Diagnostic surfacing

### Auto-inject on write/edit (the main feedback loop)

After format → LSP didChange → wait for diagnostics, the `tool_result`
handler appends a summary to `event.content`:

```
[original write/edit success message]

⚠ LSP: 2 error(s) in src/foo.ts:
src/foo.ts:42:9 error: Cannot find name 'bar' [tsserver]
src/foo.ts:51:14 error: Type 'string' is not assignable to type 'number' [tsserver]
```

**Errors only.** Warnings/info/hints are explicitly excluded with documented
reasoning in `constants.ts`:

```ts
// Severities we surface in the auto-inject path on tool_result.
//
// We deliberately surface ONLY errors here, not warnings/info/hints.
//
// Reasoning: the auto-inject runs after every write and edit, so anything
// included here costs context tokens on every tool result. Warnings are
// usually lint/style noise the model doesn't need to act on immediately,
// and including them tends to make the model "fix" things that aren't
// actually broken — wasted turns and worse signal-to-noise.
//
// The explicit `lsp_diagnostics` tool returns ALL severities, so if the
// model wants the full picture it can ask. Auto-inject stays focused on
// "you broke the build."
//
// To include warnings here, add DiagnosticSeverity.Warning to this set.
export const AUTO_INJECT_SEVERITIES = new Set<DiagnosticSeverity>([
  DiagnosticSeverity.Error,
]);
```

**Cap at 10 errors per file** via `MAX_INLINE_ERRORS_PER_FILE = 10`. Beyond
that we summarize: `... and N more error(s)`. The model will fix the first
few and re-run anyway.

**Scoped to the changed file only.** No workspace-wide noise on every edit.

### Explicit `lsp_diagnostics` tool

Tool the model can call directly:

- `lsp_diagnostics({ path: "src/foo.ts" })` — diagnostics for one file
- `lsp_diagnostics({ path: "*" })` — diagnostics across all files the LSP
  knows about (i.e., everything in the file-sync LRU)

Returns **all severities** (errors, warnings, info, hints) when called
explicitly. Different from auto-inject because the model is asking for the
full picture deliberately.

If the relevant server is `starting`, the tool blocks up to
`EXPLICIT_TOOL_BLOCK_TIMEOUT_MS = 10000` for it to become `running`. If still
not ready, returns "server still starting, try again."

If the relevant server is `missing-binary`, returns the install hint.

If the relevant server is `crashed-too-often`, returns a clear error
indicating the server has been disabled for the session.

### Explicit `lsp_navigation` tool

Single tool with an `operation` parameter (pi-lens pattern):

```ts
operation: "definition" |
  "references" |
  "hover" |
  "documentSymbol" |
  "workspaceSymbol";
```

Parameters:

- `definition`, `references`, `hover`: `{ filePath, line, character }` (1-based for the model)
- `documentSymbol`: `{ filePath }`
- `workspaceSymbol`: `{ query }`

Internally converts 1-based line/character to 0-based before sending to LSP
(LSP is 0-based; the model is more comfortable with 1-based). pi-lsp-extension
does this conversion in its tool layer; we follow the same pattern.

Returns formatted text with file paths and positions in `path:line:col`
format so the model can immediately use them in subsequent tool calls.

## Error handling — the three landmines

These are mandatory. Skipping any of them causes random host crashes weeks
into use. Each is documented inline in the code with the reason.

### 1. Patch `stdin.write` after spawn

When an LSP server dies, Node destroys its stdin. Pending fire-and-forget
notifications (`didChange`, etc.) call `stdin.write()`, which schedules a
Promise that rejects with `ERR_STREAM_DESTROYED`. Because notifications
aren't `await`ed (LSP semantics), this becomes an unhandled rejection that
no `connection.onError` listener can catch. It crashes the host.

```ts
const stdin = proc.stdin!;
const originalWrite = stdin.write;
stdin.write = function (this: typeof stdin, ...args: any[]): boolean {
  if (this.destroyed) {
    const cb = args[args.length - 1];
    if (typeof cb === "function") process.nextTick(cb);
    return false;
  }
  return originalWrite.apply(this, args as any);
} as any;
```

Source: `pi-lsp-extension/src/lsp-client.ts`.

### 2. Permanent stream error listeners _before_ `createMessageConnection`

`vscode-jsonrpc` attaches its own stream error listeners, but those are
removed when `connection.dispose()` is called. There's a window between
`dispose()` and `process.kill()` where streams can still emit `EPIPE` /
`ECONNRESET` / `ERR_STREAM_DESTROYED` with no listener — uncaught exception,
host crashes.

```ts
const swallow = (label: string) => (err: Error & { code?: string }) => {
  if (
    err.code === "ERR_STREAM_DESTROYED" ||
    err.code === "EPIPE" ||
    err.code === "ECONNRESET"
  )
    return;
  console.error(
    `[code-feedback/lsp] ${serverName} ${label} stream error:`,
    err.message,
  );
};
proc.stdin.on("error", swallow("stdin"));
proc.stdout.on("error", swallow("stdout"));
proc.stderr.on("error", swallow("stderr"));
```

Source: `pi-lens/clients/lsp/client.ts`.

### 3. Wait for the `spawn` event before writing to stdin

`child_process.spawn()` returns a process object immediately, but if the
binary doesn't exist, the `error` event (with `ENOENT`) fires asynchronously.
Writing to stdin before knowing whether the process actually started crashes
the host.

```ts
await new Promise<void>((resolve, reject) => {
  const onSpawn = () => {
    cleanup();
    resolve();
  };
  const onError = (err: Error) => {
    cleanup();
    reject(
      new Error(`Failed to spawn LSP server "${command}": ${err.message}`),
    );
  };
  proc.once("spawn", onSpawn);
  proc.once("error", onError);
});
```

This produces the clean ENOENT we use to transition to `missing-binary`.

## UI surface

### TUI status line

Updated at every `tool_execution_end` (pi-lsp-extension pattern). Format:

```
LSP: typescript ✓ | go ✗ (gopls missing)
```

`✓` for `running`, `✗` with parenthetical reason for `missing-binary` /
`crashed-too-often`. Servers in `not-started` / `starting` / `broken` show
appropriate status. Set via `ctx.ui.setStatus("code-feedback", ...)`.

### One-time notifications

On the first transition into `missing-binary` for a language, fire
`ctx.ui.notify(message, "warning")`:

```
[code-feedback] gopls not found on PATH. Go diagnostics disabled for
this session. Install: go install golang.org/x/tools/gopls@latest
```

Once per language per session — never repeated.

On the first transition into `crashed-too-often`, fire a similar notify
with the underlying error message.

### What we never tell the model

- Auto-inject on write/edit **stays silent** when the server is missing or
  broken. Telling the model "gopls is not installed" on every Go edit is
  context spam the model can't act on.
- The model finds out only via explicit tool calls (`lsp_diagnostics` /
  `lsp_navigation`), which return the install hint when relevant.

## Constants summary

All magic numbers live in `code-feedback/constants.ts` and `code-feedback/timing.ts`:

```ts
// constants.ts
export const MAX_INLINE_ERRORS_PER_FILE = 10;
export const MAX_TRACKED_DOCUMENTS = 100;
export const MAX_RESTARTS_PER_SESSION = 3;
export const LSP_MAX_FILE_BYTES = 1_000_000;
export const AUTO_INJECT_SEVERITIES = new Set<DiagnosticSeverity>([
  DiagnosticSeverity.Error,
]);

// timing.ts
export const PULL_MODE_HARD_TIMEOUT_MS = 5000;
export const PUSH_FIRST_NOTIFICATION_TIMEOUT_MS = 1500;
export const PUSH_DEBOUNCE_MS = 150;
export const PUSH_HARD_TIMEOUT_MS = 2000;
export const EXPLICIT_TOOL_BLOCK_TIMEOUT_MS = 10000;
export const BROKEN_COOLDOWN_MS = 15000;
```

## Pi extension hooks used

| Hook                                  | Purpose                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `pi.on("session_start", ...)`         | Construct `LspManager` and `FileSync` for the session cwd.                           |
| `pi.on("tool_result", ...)`           | Format → LSP didChange → wait diagnostics → append errors. Single sequenced handler. |
| `pi.on("tool_execution_end", ...)`    | Update TUI status line widget.                                                       |
| `pi.on("session_shutdown", ...)`      | Shut down all LSP clients gracefully.                                                |
| `pi.registerTool(lspDiagnosticsTool)` | The `lsp_diagnostics` tool.                                                          |
| `pi.registerTool(lspNavigationTool)`  | The `lsp_navigation` tool.                                                           |

We do **NOT** override `read`/`write`/`edit`/`bash`. Everything is observational
via `tool_result`. We do **NOT** use the `context` event to inject diagnostics
into the LLM message stream — auto-inject on `tool_result` is sufficient.

## Documentation impact

- `CLAUDE.md` (project): no changes needed; the file is structural, not
  per-extension.
- `README.md`: needs an entry for the new extension under whatever section
  describes Pi extensions (none currently exists, may not need adding).
- Existing `autoformat/` references in docs/scripts: search and update.
  Worth doing as a final task in the implementation plan.

## Risks and open questions

- **`typescript-language-server` cold start time** on large monorepos can
  exceed our timeouts. Acceptable for v1 — the first edit gets no diagnostics
  (lazy-return-null), subsequent edits work normally once tsserver is warm.
- **gopls per-module spawning** in monorepos: each `go.mod` gets its own
  gopls instance. Memory usage scales with module count. Acceptable for now.
- **Pull mode capability detection** — we trust the server's
  `InitializeResult.capabilities.diagnosticProvider` field. If a server lies
  (advertises it but doesn't actually implement it), pull-mode requests will
  fail and we should fall back. v1 doesn't handle this; we'll add fallback
  logic if it ever happens with a real server.
- **No way for the user to disable a built-in language at runtime** without
  editing `servers.ts`. If gopls is broken upstream and the user wants to
  disable Go LSP without losing TypeScript LSP, they have to edit code.
  Acceptable for v1; revisit if it actually becomes painful.

## Future work (explicitly out of v1)

- `.pi-lsp.json` config file for adding/disabling languages
- Tree-sitter fallback for unsupported languages or during server startup
- Completions tool with synthetic-dot trick (pi-lsp-extension pattern)
- Rename-preview tool (pi-lsp-extension pattern)
- Code actions / quick fixes
- Multi-server-per-extension (running biome + tsserver on the same `.ts` file)
- Auto-install of language servers
- Progress notification handling (`window/workDoneProgress/*`)
- Workspace-wide pull-mode diagnostics (`workspace/diagnostic`)
