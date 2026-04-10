# code-feedback Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Expand the existing `autoformat` Pi extension into a unified `code-feedback` extension that runs autoformat, then LSP diagnostics, then injects errors into the model's view of the tool result. Ships with gopls and typescript-language-server, plus a navigation tool.

**Architecture:** Single Pi extension with one `tool_result` listener that sequences format → LSP didChange → wait for diagnostics → append errors. JSON-RPC client built on `vscode-languageserver-protocol`. Per-language state machine handles lazy-start, restart cooldowns, and missing-binary detection. Two agent-callable tools (`lsp_diagnostics`, `lsp_navigation`) on top of the same client.

**Tech Stack:** TypeScript, `vscode-languageserver-protocol` (re-exports `vscode-jsonrpc`), Node `child_process`, Pi extension API (`@mariozechner/pi-coding-agent`).

**Reference design:** `.designs/2026-04-10-lsp-extension.md` (commit `c58883a`). Read it before starting any task — it has the full reasoning behind every decision below.

---

## Conventions for this plan

This project does not have a test framework. The existing `autoformat` extension has zero tests. **Do not add a test framework.** Validation in this plan uses two mechanisms:

1. **`make typecheck`** — runs `npx -p typescript tsc` against `pi/agent/extensions/**/*.ts`. Catches all type errors and most structural mistakes. Run after every code change.
2. **Manual smoke test in a real Pi session** — at specific tasks marked "smoke test," start `pi` in a real Go or TypeScript directory, perform the indicated edit, and verify the expected behavior.

**Commit style:** project uses conventional commits per `CLAUDE.md`: `<type>(<scope>): <description>`. Imperative mood, under 50 chars, no trailing period. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`. Each task ends with a commit.

**Editing the source:** never edit files in `~/.pi/` (those are stow symlinks). Edit files in `pi/agent/extensions/code-feedback/`. Stow is already configured — edits take effect immediately in any Pi session.

**Paths in this plan are relative to the repo root.** Run all commands from the repo root unless explicitly stated.

---

## Task 1: Add the `vscode-languageserver-protocol` dependency

**Files:**

- Modify: `package.json`

**Step 1: Inspect current devDependencies**

Read `package.json`. Note the existing `devDependencies` block contains `@mariozechner/pi-coding-agent`, `@sinclair/typebox`, `prettier`, `typescript`.

**Step 2: Add the dependency**

Add `"vscode-languageserver-protocol": "^3.17.5"` to `devDependencies`. Keep entries in alphabetical order. The full block becomes:

```json
"devDependencies": {
  "@mariozechner/pi-coding-agent": "^0.65.0",
  "@sinclair/typebox": "^0.34.0",
  "prettier": "^3.8.1",
  "typescript": "^5.0.0",
  "vscode-languageserver-protocol": "^3.17.5"
}
```

**Step 3: Install**

Run: `make install-dev`
Expected: clean install, `node_modules/vscode-languageserver-protocol/` exists, no peer-dep warnings about it.

**Step 4: Verify import resolves**

Run: `node -e "console.log(Object.keys(require('vscode-languageserver-protocol')).slice(0, 5))"`
Expected: prints an array of LSP type names (e.g. `[ 'CancellationToken', 'CancellationTokenSource', ... ]`) without errors.

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vscode-languageserver-protocol dep"
```

---

## Task 2: Rename `autoformat/` to `code-feedback/` with format subdirectory

This task ONLY moves files. It does not change any logic. We keep autoformat working at every step so we can validate that the rename didn't break anything.

**Files:**

- Move: `pi/agent/extensions/autoformat/index.ts` → `pi/agent/extensions/code-feedback/index.ts`
- Move: `pi/agent/extensions/autoformat/gofmt.ts` → `pi/agent/extensions/code-feedback/format/gofmt.ts`
- Move: `pi/agent/extensions/autoformat/prettier.ts` → `pi/agent/extensions/code-feedback/format/prettier.ts`
- Move: `pi/agent/extensions/autoformat/utils.ts` → `pi/agent/extensions/code-feedback/format/utils.ts`
- Move: `pi/agent/extensions/autoformat/README.md` → `pi/agent/extensions/code-feedback/README.md`
- Modify: `pi/agent/extensions/code-feedback/index.ts` (update imports to point at `./format/...`)
- Modify: `pi/agent/extensions/code-feedback/format/gofmt.ts` (update import path for `./utils.js`)
- Modify: `pi/agent/extensions/code-feedback/format/prettier.ts` (update import path for `./utils.js`)

**Step 1: Move the files with `git mv`**

```bash
git mv pi/agent/extensions/autoformat pi/agent/extensions/code-feedback
mkdir -p pi/agent/extensions/code-feedback/format
git mv pi/agent/extensions/code-feedback/gofmt.ts pi/agent/extensions/code-feedback/format/gofmt.ts
git mv pi/agent/extensions/code-feedback/prettier.ts pi/agent/extensions/code-feedback/format/prettier.ts
git mv pi/agent/extensions/code-feedback/utils.ts pi/agent/extensions/code-feedback/format/utils.ts
```

**Step 2: Fix imports in `index.ts`**

In `pi/agent/extensions/code-feedback/index.ts`, change the three import lines:

```typescript
import { formatGoFile } from "./gofmt.js";
import { formatWithPrettier } from "./prettier.js";
import {
  getToolPath,
  type NotifyContext,
  logFormattingIssue,
} from "./utils.js";
```

To:

```typescript
import { formatGoFile } from "./format/gofmt.js";
import { formatWithPrettier } from "./format/prettier.js";
import {
  getToolPath,
  type NotifyContext,
  logFormattingIssue,
} from "./format/utils.js";
```

(`gofmt.ts` and `prettier.ts` already import `./utils.js` as siblings — the move keeps that relationship intact, no edits needed there.)

**Step 3: Type-check**

Run: `make typecheck`
Expected: no errors. The rename should leave behavior identical.

**Step 4: Smoke test (optional but recommended)**

Open a `.go` or `.ts` file in a Pi session, edit it with bad formatting, and verify the file still gets autoformatted on save. If you skip this, the next tasks' smoke tests will catch any regression.

**Step 5: Commit**

```bash
git add -A pi/agent/extensions/
git commit -m "refactor: rename autoformat to code-feedback"
```

---

## Task 3: Add `constants.ts` and `timing.ts`

Pure data files. No logic. These centralize every magic number in the design so future-you can tune them in one place.

**Files:**

- Create: `pi/agent/extensions/code-feedback/constants.ts`
- Create: `pi/agent/extensions/code-feedback/timing.ts`

**Step 1: Create `constants.ts`**

```typescript
import { DiagnosticSeverity } from "vscode-languageserver-protocol";

/**
 * Maximum number of error diagnostics to inline in a write/edit tool_result.
 *
 * Beyond this we show "... and N more error(s)". Increase if the model
 * frequently needs more context at once; decrease if context bloat becomes
 * a problem.
 */
export const MAX_INLINE_ERRORS_PER_FILE = 10;

/**
 * Maximum documents tracked in the per-language LRU. When exceeded, the
 * oldest tracked document is evicted with a `didClose` notification to the
 * relevant LSP server. Prevents memory leaks in long sessions on big repos.
 */
export const MAX_TRACKED_DOCUMENTS = 100;

/**
 * Maximum number of restart attempts per language server per session before
 * we give up and mark the server as `crashed-too-often`. Prevents infinite
 * crash loops on a fundamentally broken server (e.g. one that panics on a
 * specific malformed file the model keeps editing).
 */
export const MAX_RESTARTS_PER_SESSION = 3;

/**
 * Skip LSP entirely for files larger than this many bytes. Format still
 * runs (it's a separate code path); LSP just doesn't bother. Avoids
 * sending huge generated files through tsserver/gopls.
 */
export const LSP_MAX_FILE_BYTES = 1_000_000;

/**
 * Severities we surface in the auto-inject path on tool_result.
 *
 * We deliberately surface ONLY errors here, not warnings/info/hints.
 *
 * Reasoning: the auto-inject runs after every write and edit, so anything
 * included here costs context tokens on every tool result. Warnings are
 * usually lint/style noise the model doesn't need to act on immediately,
 * and including them tends to make the model "fix" things that aren't
 * actually broken — wasted turns and worse signal-to-noise.
 *
 * The explicit `lsp_diagnostics` tool returns ALL severities, so if the
 * model wants the full picture it can ask. Auto-inject stays focused on
 * "you broke the build."
 *
 * To include warnings here, add DiagnosticSeverity.Warning to this set.
 */
export const AUTO_INJECT_SEVERITIES: ReadonlySet<DiagnosticSeverity> = new Set([
  DiagnosticSeverity.Error,
]);
```

**Step 2: Create `timing.ts`**

```typescript
/**
 * All timeouts (in milliseconds) used by the LSP layer. Centralized so
 * future tuning happens in one place. See `.designs/2026-04-10-lsp-extension.md`
 * for the reasoning behind each value.
 */

/**
 * Pull-mode (`textDocument/diagnostic`) hard timeout. The server holds the
 * response until its analysis completes, so we don't normally need a
 * deadline — this is a safety net for hung servers.
 */
export const PULL_MODE_HARD_TIMEOUT_MS = 5000;

/**
 * Push-mode: how long to wait for the FIRST `publishDiagnostics`
 * notification after a `didChange`. If the server doesn't bother sending
 * empty diagnostics for a clean file, this is how long we wait before
 * giving up and returning the empty cache.
 */
export const PUSH_FIRST_NOTIFICATION_TIMEOUT_MS = 1500;

/**
 * Push-mode: after the first notification arrives, debounce by this much
 * to catch the follow-up semantic pass. Most LSP servers send syntax
 * diagnostics within ~50ms then semantic diagnostics ~150-500ms later.
 */
export const PUSH_DEBOUNCE_MS = 150;

/**
 * Push-mode: absolute hard cap. We never wait longer than this for
 * push-mode diagnostics, even if notifications keep arriving.
 */
export const PUSH_HARD_TIMEOUT_MS = 2000;

/**
 * When the explicit `lsp_diagnostics` tool is called and the relevant
 * server is in `starting` state, block this long for it to become
 * `running`. After this we return "still starting, try again".
 */
export const EXPLICIT_TOOL_BLOCK_TIMEOUT_MS = 10000;

/**
 * After a `broken` transition (server crashed or init failed for a
 * non-ENOENT reason), wait this long before allowing a restart attempt.
 * `missing-binary` (ENOENT) state is permanent and ignores this — there's
 * no point retrying when the binary literally doesn't exist on disk.
 */
export const BROKEN_COOLDOWN_MS = 15000;
```

**Step 3: Type-check**

Run: `make typecheck`
Expected: no errors. Both files type-check cleanly because they're pure data.

**Step 4: Commit**

```bash
git add pi/agent/extensions/code-feedback/constants.ts pi/agent/extensions/code-feedback/timing.ts
git commit -m "feat(code-feedback): add constants and timing"
```

---

## Task 4: Add `lsp/servers.ts` and `lsp/language-map.ts`

The hardcoded server registry and the extension → languageId lookup.

**Files:**

- Create: `pi/agent/extensions/code-feedback/lsp/servers.ts`
- Create: `pi/agent/extensions/code-feedback/lsp/language-map.ts`

**Step 1: Create `lsp/servers.ts`**

```typescript
/**
 * Hardcoded LSP server registry. v1 ships with Go and TypeScript/JavaScript.
 * Adding a language is a code change here — there is no config file by
 * design (see `.designs/2026-04-10-lsp-extension.md`).
 */

export interface ServerConfig {
  /** Executable name. Looked up on PATH at spawn time. */
  command: string;
  /** Arguments passed to the executable. */
  args: string[];
  /** File extensions handled by this server. Lowercase, includes leading dot. */
  extensions: string[];
  /**
   * Filenames walked-up-from-the-file-directory to determine the workspace
   * root. The first marker found wins. For monorepos with multiple `go.mod`s
   * this means each module gets its own server instance.
   */
  rootMarkers: string[];
  /**
   * Human-readable installation hint, shown to the user via `ctx.ui.notify`
   * on the first ENOENT and via the explicit tool response when the model
   * tries to use a missing server.
   */
  installHint: string;
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
    // Same server handles JavaScript too.
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
    rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json"],
    installHint:
      "Install: npm install -g typescript-language-server typescript",
  },
};
```

**Step 2: Create `lsp/language-map.ts`**

```typescript
import { extname } from "node:path";
import { DEFAULT_SERVERS } from "./servers.js";

/**
 * Built once at module load by walking DEFAULT_SERVERS. Maps lowercase
 * extension (with leading dot) to language ID.
 *
 * Last-write-wins for duplicate extensions, but in v1 no two servers claim
 * the same extension — this only matters when DEFAULT_SERVERS grows.
 */
const EXTENSION_TO_LANGUAGE: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [languageId, config] of Object.entries(DEFAULT_SERVERS)) {
    for (const ext of config.extensions) {
      map.set(ext.toLowerCase(), languageId);
    }
  }
  return map;
})();

/**
 * Returns the language ID for a file path, or `null` if no configured
 * server handles its extension.
 */
export function getLanguageIdForFile(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE.get(ext) ?? null;
}

/**
 * LSP `languageId` strings used in `textDocument/didOpen`. Maps internal
 * registry IDs to the canonical LSP language IDs. For TypeScript we have
 * to be more granular than the registry ID — gopls is happy with "go" for
 * any `.go` file, but tsserver wants "typescriptreact" for `.tsx`.
 */
export function getLspLanguageId(filePath: string, registryId: string): string {
  if (registryId === "typescript") {
    const ext = extname(filePath).toLowerCase();
    if (ext === ".tsx") return "typescriptreact";
    if (ext === ".jsx") return "javascriptreact";
    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "javascript";
    return "typescript";
  }
  return registryId;
}
```

**Step 3: Type-check**

Run: `make typecheck`
Expected: no errors.

**Step 4: Sanity-check the maps at the REPL**

This is a one-off verification, not a permanent test. Run from the repo root:

```bash
node --input-type=module -e '
import { getLanguageIdForFile, getLspLanguageId } from "./pi/agent/extensions/code-feedback/lsp/language-map.js";
console.log("main.go        →", getLanguageIdForFile("main.go"));
console.log("foo.tsx        →", getLanguageIdForFile("foo.tsx"));
console.log("README.md      →", getLanguageIdForFile("README.md"));
console.log("LSP id for tsx →", getLspLanguageId("foo.tsx", "typescript"));
console.log("LSP id for go  →", getLspLanguageId("main.go", "go"));
'
```

Expected output:

```
main.go        → go
foo.tsx        → typescript
README.md      → null
LSP id for tsx → typescriptreact
LSP id for go  → go
```

(This requires the `.ts` files to have been compiled to `.js`, which they aren't because we use `noEmit: true`. If the import fails, that's expected — type-check is the real validation; this REPL check is optional. Skip if it complains about ESM/CJS mismatch.)

**Step 5: Commit**

```bash
git add pi/agent/extensions/code-feedback/lsp/servers.ts pi/agent/extensions/code-feedback/lsp/language-map.ts
git commit -m "feat(code-feedback): add lsp server registry and language map"
```

---

## Task 5: Implement `lsp/client.ts` — spawn, landmines, initialize

This is the most safety-critical file in the extension. The three landmines documented in the design (`stdin.write` patch, permanent stream listeners, await spawn event) MUST be in place before any other LSP code runs. Skipping any of them produces random host crashes.

**Files:**

- Create: `pi/agent/extensions/code-feedback/lsp/client.ts`

**Step 1: Write the file**

```typescript
import {
  type ChildProcessByStdio,
  spawn as spawnChildProcess,
} from "node:child_process";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
import { type Readable, type Writable } from "node:stream";
import {
  createMessageConnection,
  type MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node.js";
import {
  type Diagnostic,
  type InitializeParams,
  type InitializeResult,
  type PublishDiagnosticsParams,
  type ServerCapabilities,
} from "vscode-languageserver-protocol";

import {
  PUSH_DEBOUNCE_MS,
  PUSH_FIRST_NOTIFICATION_TIMEOUT_MS,
  PUSH_HARD_TIMEOUT_MS,
  PULL_MODE_HARD_TIMEOUT_MS,
} from "../timing.js";

export type SpawnError =
  | { kind: "missing-binary"; command: string; cause: Error }
  | { kind: "other"; cause: Error };

export interface LspClientOptions {
  /** Logical name used in error messages and logs (e.g. "go", "typescript"). */
  serverName: string;
  /** Executable to spawn. */
  command: string;
  /** Args for the executable. */
  args: string[];
  /** Working directory for the spawned process. Should be the workspace root. */
  cwd: string;
  /** Workspace root URI passed to LSP `initialize`. */
  rootUri: string;
}

/**
 * Wrapper around a single LSP server process. One instance per (language,
 * workspace-root) pair. Lifetime is managed by `LspManager`.
 *
 * Critical safety notes — see `.designs/2026-04-10-lsp-extension.md`
 * "The three landmines":
 *
 * 1. `stdin.write` is patched to silently no-op when the stream is
 *    destroyed. Without this, fire-and-forget LSP notifications become
 *    unhandled rejections after the server dies.
 *
 * 2. Persistent `error` listeners are attached to all three stdio streams
 *    BEFORE `createMessageConnection`. They survive `connection.dispose()`
 *    and swallow expected post-crash errors (EPIPE, ECONNRESET,
 *    ERR_STREAM_DESTROYED).
 *
 * 3. We `await` the `spawn` event before doing anything with stdin. If
 *    the binary doesn't exist, `error` (with ENOENT) fires asynchronously
 *    and would otherwise crash the host.
 */
export class LspClient {
  private process: ChildProcessByStdio<Writable, Readable, Readable> | null =
    null;
  private connection: MessageConnection | null = null;
  private capabilities: ServerCapabilities | null = null;
  private isStopping = false;
  private readonly diagnosticsCache = new Map<string, Diagnostic[]>();
  private readonly diagnosticEmitter = new EventEmitter();

  constructor(private readonly options: LspClientOptions) {
    // pi-lens uses 50; we may have several concurrent waitForDiagnostics
    // callers per URI. Avoid Node's listener-leak warnings.
    this.diagnosticEmitter.setMaxListeners(50);
  }

  /**
   * Spawns the LSP server process and runs the LSP `initialize` handshake.
   * Throws a tagged `SpawnError` on failure so the manager can distinguish
   * ENOENT (permanent) from other failures (cooldown + retry).
   */
  async start(): Promise<void> {
    const proc = spawnChildProcess(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    }) as ChildProcessByStdio<Writable, Readable, Readable>;

    this.process = proc;

    // LANDMINE #3: wait for spawn vs error before touching stdin.
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        proc.off("spawn", onSpawn);
        proc.off("error", onError);
      };
      const onSpawn = () => {
        cleanup();
        resolve();
      };
      const onError = (err: NodeJS.ErrnoException) => {
        cleanup();
        const tagged: SpawnError =
          err.code === "ENOENT"
            ? {
                kind: "missing-binary",
                command: this.options.command,
                cause: err,
              }
            : { kind: "other", cause: err };
        reject(tagged);
      };
      proc.once("spawn", onSpawn);
      proc.once("error", onError);
    });

    // LANDMINE #1: patch stdin.write to no-op after destruction. Pending
    // fire-and-forget notifications would otherwise produce unhandled
    // rejections when the server dies mid-notification.
    const stdin = proc.stdin;
    const originalWrite = stdin.write.bind(stdin);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stdin as any).write = function (...args: any[]): boolean {
      if (stdin.destroyed) {
        const cb = args[args.length - 1];
        if (typeof cb === "function") process.nextTick(cb);
        return false;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return (originalWrite as any)(...args);
    };

    // LANDMINE #2: permanent stream error listeners attached BEFORE
    // createMessageConnection. They survive connection.dispose() and
    // catch the window between dispose and process.kill where streams
    // can still emit EPIPE / ECONNRESET / ERR_STREAM_DESTROYED.
    const swallow = (label: string) => (err: NodeJS.ErrnoException) => {
      if (
        err.code === "ERR_STREAM_DESTROYED" ||
        err.code === "EPIPE" ||
        err.code === "ECONNRESET"
      ) {
        return;
      }
      console.error(
        `[code-feedback/lsp] ${this.options.serverName} ${label} stream error:`,
        err.message,
      );
    };
    proc.stdin.on("error", swallow("stdin"));
    proc.stdout.on("error", swallow("stdout"));
    proc.stderr.on("error", swallow("stderr"));

    // Capture stderr for diagnostics. LSP servers often log helpful
    // context here (e.g. tsserver "Initializing project...").
    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        console.error(
          `[code-feedback/lsp] ${this.options.serverName} stderr:`,
          text,
        );
      }
    });

    // Detect crashes — used by the manager to transition to `broken`.
    proc.on("exit", (code, signal) => {
      if (this.isStopping) return;
      console.error(
        `[code-feedback/lsp] ${this.options.serverName} exited unexpectedly`,
        { code, signal },
      );
      this.connection?.dispose();
      this.connection = null;
    });

    // Wire up vscode-jsonrpc.
    this.connection = createMessageConnection(
      new StreamMessageReader(proc.stdout),
      new StreamMessageWriter(proc.stdin),
    );

    this.connection.onError(([err]) => {
      console.error(
        `[code-feedback/lsp] ${this.options.serverName} connection error:`,
        err.message,
      );
    });

    this.connection.onClose(() => {
      if (!this.isStopping) {
        console.error(
          `[code-feedback/lsp] ${this.options.serverName} connection closed`,
        );
      }
    });

    this.connection.onNotification(
      "textDocument/publishDiagnostics",
      (params: PublishDiagnosticsParams) => {
        this.diagnosticsCache.set(params.uri, params.diagnostics);
        this.diagnosticEmitter.emit(params.uri);
      },
    );

    // workspace/configuration is a request-response that some servers
    // (pyright, tsserver) send during init. We don't have any per-section
    // config to provide; return null per item to satisfy the protocol.
    this.connection.onRequest(
      "workspace/configuration",
      (params: { items: Array<{ section?: string }> }) =>
        params.items.map(() => null),
    );

    this.connection.listen();

    // LSP `initialize`.
    const initParams: InitializeParams = {
      processId: process.pid,
      rootUri: this.options.rootUri,
      workspaceFolders: [
        {
          uri: this.options.rootUri,
          name: this.options.serverName,
        },
      ],
      capabilities: {
        workspace: {
          workspaceFolders: true,
          configuration: true,
        },
        textDocument: {
          synchronization: {
            didSave: false,
            dynamicRegistration: false,
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
          // Pull-mode diagnostics — LSP 3.17+. Both gopls and tsserver
          // support this; we use it preferentially in `getDiagnostics`.
          diagnostic: {
            dynamicRegistration: false,
          },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        },
      },
      initializationOptions: {},
    };

    const initResult: InitializeResult = await this.connection.sendRequest(
      "initialize",
      initParams,
    );
    this.capabilities = initResult.capabilities;

    await this.connection.sendNotification("initialized", {});
  }

  /** Server capabilities reported in InitializeResult. */
  getCapabilities(): ServerCapabilities | null {
    return this.capabilities;
  }

  /**
   * True if the server advertised pull-mode diagnostics support
   * (`diagnosticProvider`). gopls and tsserver both do.
   */
  supportsPullDiagnostics(): boolean {
    return this.capabilities?.diagnosticProvider !== undefined;
  }

  /**
   * Graceful shutdown: send `shutdown` request, then `exit` notification,
   * then SIGTERM with a short grace period, then SIGKILL.
   */
  async stop(): Promise<void> {
    if (this.isStopping) return;
    this.isStopping = true;

    if (this.connection) {
      try {
        await Promise.race([
          this.connection.sendRequest("shutdown").catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        this.connection.sendNotification("exit").catch(() => {});
      } catch {
        /* ignore */
      }
      this.connection.dispose();
      this.connection = null;
    }

    if (this.process) {
      const proc = this.process;
      proc.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!proc.killed) proc.kill("SIGKILL");
      this.process = null;
    }
  }

  // Methods to be filled in by Tasks 6, 7, 8 below:
  // - getDiagnostics(uri)         → Task 6 (pull mode + push fallback)
  // - openDocument(...)           → Task 6
  // - changeDocument(...)         → Task 6
  // - closeDocument(uri)          → Task 6
  // - definition(...)             → Task 7
  // - references(...)             → Task 7
  // - hover(...)                  → Task 7
  // - documentSymbol(...)         → Task 7
  // - workspaceSymbol(...)        → Task 7
}

/** Builds the `file://` URI from an absolute filesystem path. */
export function fileUriFor(absPath: string): string {
  return pathToFileURL(absPath).href;
}
```

**Step 2: Type-check**

Run: `make typecheck`
Expected: no errors. If you get a complaint about `vscode-jsonrpc/node.js`, verify Task 1 installed `vscode-languageserver-protocol` correctly — `vscode-jsonrpc` is a transitive dep of it.

**Step 3: Commit**

```bash
git add pi/agent/extensions/code-feedback/lsp/client.ts
git commit -m "feat(code-feedback): add lsp client with spawn and init"
```

---

## Task 6: Add document sync and diagnostic acquisition to `LspClient`

Pull-mode is the preferred path. Push-fallback covers any custom server we might add later that doesn't advertise `diagnosticProvider`.

**Files:**

- Modify: `pi/agent/extensions/code-feedback/lsp/client.ts`

**Step 1: Add document sync methods to `LspClient`**

Insert these methods inside the `LspClient` class, after `supportsPullDiagnostics()`:

```typescript
  /** Sends `textDocument/didOpen`. */
  openDocument(uri: string, languageId: string, version: number, text: string): void {
    if (!this.connection) return;
    this.connection.sendNotification("textDocument/didOpen", {
      textDocument: { uri, languageId, version, text },
    });
  }

  /**
   * Sends `textDocument/didChange` with full-content sync. Incremental sync
   * is not implemented — full-content is simpler and matches both pi-lens
   * and pi-lsp-extension.
   */
  changeDocument(uri: string, version: number, text: string): void {
    if (!this.connection) return;
    this.connection.sendNotification("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  /** Sends `textDocument/didClose`. */
  closeDocument(uri: string): void {
    if (!this.connection) return;
    this.connection.sendNotification("textDocument/didClose", {
      textDocument: { uri },
    });
  }
```

**Step 2: Add `getDiagnostics` (the unified pull/push entry point)**

Insert after `closeDocument`:

```typescript
  /**
   * Returns the current diagnostics for a URI. Uses pull-mode
   * (`textDocument/diagnostic`) if the server supports it, otherwise
   * falls back to push-mode wait-and-debounce.
   */
  async getDiagnostics(uri: string): Promise<Diagnostic[]> {
    if (!this.connection) return [];

    if (this.supportsPullDiagnostics()) {
      return this.getDiagnosticsPullMode(uri);
    }
    return this.getDiagnosticsPushMode(uri);
  }

  private async getDiagnosticsPullMode(uri: string): Promise<Diagnostic[]> {
    if (!this.connection) return [];
    try {
      const result = await Promise.race([
        this.connection.sendRequest<{
          kind: "full" | "unchanged";
          items?: Diagnostic[];
        }>("textDocument/diagnostic", {
          textDocument: { uri },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("pull-mode diagnostic timed out")),
            PULL_MODE_HARD_TIMEOUT_MS,
          ),
        ),
      ]);

      if (result.kind === "full") return result.items ?? [];
      // "unchanged" — return cached, which is whatever we last got via push
      // or the previous pull. Most servers don't actually use "unchanged"
      // unless we provide a previousResultId, which we don't.
      return this.diagnosticsCache.get(uri) ?? [];
    } catch (err) {
      console.error(
        `[code-feedback/lsp] ${this.options.serverName} pull-mode diagnostic failed:`,
        err instanceof Error ? err.message : err,
      );
      return this.diagnosticsCache.get(uri) ?? [];
    }
  }

  private async getDiagnosticsPushMode(uri: string): Promise<Diagnostic[]> {
    // Wait for the first publishDiagnostics, then debounce for follow-ups.
    // Hard cap at PUSH_HARD_TIMEOUT_MS.
    const start = Date.now();

    const firstNotification = new Promise<void>((resolve) => {
      const onUpdate = (eventUri: string) => {
        if (eventUri === uri) {
          this.diagnosticEmitter.off(uri, onUpdate);
          resolve();
        }
      };
      this.diagnosticEmitter.on(uri, onUpdate);
      setTimeout(() => {
        this.diagnosticEmitter.off(uri, onUpdate);
        resolve();
      }, PUSH_FIRST_NOTIFICATION_TIMEOUT_MS);
    });

    await firstNotification;

    // Debounce: wait `PUSH_DEBOUNCE_MS` after the most recent notification,
    // capped by `PUSH_HARD_TIMEOUT_MS` total.
    let lastSeen = Date.now();
    const onUpdate = (eventUri: string) => {
      if (eventUri === uri) lastSeen = Date.now();
    };
    this.diagnosticEmitter.on(uri, onUpdate);
    try {
      while (
        Date.now() - lastSeen < PUSH_DEBOUNCE_MS &&
        Date.now() - start < PUSH_HARD_TIMEOUT_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, PUSH_DEBOUNCE_MS));
      }
    } finally {
      this.diagnosticEmitter.off(uri, onUpdate);
    }

    return this.diagnosticsCache.get(uri) ?? [];
  }

  /** Direct cache read with no waiting. Used by `lsp_diagnostics` for `path: "*"`. */
  getCachedDiagnostics(uri: string): Diagnostic[] {
    return this.diagnosticsCache.get(uri) ?? [];
  }

  /** All URIs the client has diagnostics cached for. */
  getCachedUris(): string[] {
    return Array.from(this.diagnosticsCache.keys());
  }
```

**Step 3: Type-check**

Run: `make typecheck`
Expected: no errors.

**Step 4: Commit**

```bash
git add pi/agent/extensions/code-feedback/lsp/client.ts
git commit -m "feat(code-feedback): add lsp document sync and diagnostics"
```

---

## Task 7: Add navigation methods to `LspClient`

`definition`, `references`, `hover`, `documentSymbol`, `workspaceSymbol`. Thin wrappers around `connection.sendRequest` with typed return values.

**Files:**

- Modify: `pi/agent/extensions/code-feedback/lsp/client.ts`

**Step 1: Add the imports**

At the top of `client.ts`, add to the existing `vscode-languageserver-protocol` import:

```typescript
import {
  type Diagnostic,
  type DocumentSymbol,
  type Hover,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type LocationLink,
  type Position,
  type PublishDiagnosticsParams,
  type ServerCapabilities,
  type SymbolInformation,
} from "vscode-languageserver-protocol";
```

**Step 2: Add navigation methods inside `LspClient`**

Insert after `getCachedUris()`:

```typescript
  /** `textDocument/definition` */
  async definition(
    uri: string,
    position: Position,
  ): Promise<Location[] | LocationLink[] | null> {
    if (!this.connection) return null;
    return this.connection.sendRequest("textDocument/definition", {
      textDocument: { uri },
      position,
    });
  }

  /** `textDocument/references` */
  async references(uri: string, position: Position): Promise<Location[] | null> {
    if (!this.connection) return null;
    return this.connection.sendRequest("textDocument/references", {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true },
    });
  }

  /** `textDocument/hover` */
  async hover(uri: string, position: Position): Promise<Hover | null> {
    if (!this.connection) return null;
    return this.connection.sendRequest("textDocument/hover", {
      textDocument: { uri },
      position,
    });
  }

  /** `textDocument/documentSymbol` */
  async documentSymbol(
    uri: string,
  ): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    if (!this.connection) return null;
    return this.connection.sendRequest("textDocument/documentSymbol", {
      textDocument: { uri },
    });
  }

  /** `workspace/symbol` */
  async workspaceSymbol(query: string): Promise<SymbolInformation[] | null> {
    if (!this.connection) return null;
    return this.connection.sendRequest("workspace/symbol", { query });
  }
```

**Step 3: Type-check**

Run: `make typecheck`
Expected: no errors.

**Step 4: Commit**

```bash
git add pi/agent/extensions/code-feedback/lsp/client.ts
git commit -m "feat(code-feedback): add lsp navigation methods"
```

---

## Task 8: Implement `lsp/manager.ts` — state machine and lazy start

`LspManager` owns the per-language state and lifetime. Lazy-return-null pattern for startup so the model never blocks.

**Files:**

- Create: `pi/agent/extensions/code-feedback/lsp/manager.ts`

**Step 1: Write the file**

```typescript
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

import { MAX_RESTARTS_PER_SESSION } from "../constants.js";
import { BROKEN_COOLDOWN_MS } from "../timing.js";
import { fileUriFor, LspClient, type SpawnError } from "./client.js";
import { getLanguageIdForFile } from "./language-map.js";
import { DEFAULT_SERVERS, type ServerConfig } from "./servers.js";

export type ServerState =
  | { kind: "not-started" }
  | { kind: "starting"; promise: Promise<void> }
  | { kind: "running"; client: LspClient; restarts: number; rootDir: string }
  | { kind: "missing-binary"; command: string }
  | {
      kind: "broken";
      error: Error;
      cooldownUntil: number;
      restarts: number;
    }
  | { kind: "crashed-too-often"; error: Error };

export type StateChangeListener = (
  languageId: string,
  state: ServerState,
) => void;

/**
 * Per-(language, root) LSP server lifecycle. Lazy-start on first
 * write/edit of a matching file. Never started by `read` operations.
 */
export class LspManager {
  // Key: `${languageId}:${rootDir}`
  private readonly states = new Map<string, ServerState>();
  private readonly listeners = new Set<StateChangeListener>();
  private readonly missingBinaryNotified = new Set<string>();
  private readonly crashedNotified = new Set<string>();

  /**
   * Walks up from `filePath`'s directory until it finds one of `markers`.
   * Returns null if none found within the file's full ancestor chain.
   */
  resolveRoot(filePath: string, markers: string[]): string | null {
    let dir = dirname(resolve(filePath));
    const root = resolve("/");
    while (true) {
      for (const marker of markers) {
        if (existsSync(resolve(dir, marker))) return dir;
      }
      if (dir === root) return null;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  /**
   * Returns the running client for a file, or `null` if no server is
   * running yet. If the server is `not-started`, this kicks off
   * `startServer()` in the background and returns `null` immediately.
   * Subsequent calls (after the start completes) return the client.
   */
  getRunningClient(filePath: string): LspClient | null {
    const languageId = getLanguageIdForFile(filePath);
    if (!languageId) return null;

    const config = DEFAULT_SERVERS[languageId];
    if (!config) return null;

    const root = this.resolveRoot(filePath, config.rootMarkers);
    if (!root) return null;

    const key = `${languageId}:${root}`;
    const state = this.states.get(key) ?? { kind: "not-started" };

    switch (state.kind) {
      case "running":
        return state.client;

      case "not-started":
        this.startServer(languageId, config, root);
        return null;

      case "broken":
        if (Date.now() >= state.cooldownUntil) {
          this.startServer(languageId, config, root);
        }
        return null;

      case "starting":
      case "missing-binary":
      case "crashed-too-often":
        return null;
    }
  }

  /**
   * Returns the current state for the (language, root) pair backing
   * `filePath`, or `not-started` if we've never tried.
   */
  getState(filePath: string): ServerState {
    const languageId = getLanguageIdForFile(filePath);
    if (!languageId) return { kind: "not-started" };
    const config = DEFAULT_SERVERS[languageId];
    if (!config) return { kind: "not-started" };
    const root = this.resolveRoot(filePath, config.rootMarkers);
    if (!root) return { kind: "not-started" };
    return this.states.get(`${languageId}:${root}`) ?? { kind: "not-started" };
  }

  /** All states keyed by `${languageId}:${rootDir}` for status display. */
  getAllStates(): Map<string, ServerState> {
    return new Map(this.states);
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Shut down all running clients. Called from `session_shutdown`. */
  async shutdownAll(): Promise<void> {
    const promises: Array<Promise<void>> = [];
    for (const state of this.states.values()) {
      if (state.kind === "running") promises.push(state.client.stop());
    }
    await Promise.all(promises);
    this.states.clear();
  }

  /**
   * Spawns the server in the background. Updates state through
   * starting → running (or → missing-binary / broken / crashed-too-often).
   */
  private startServer(
    languageId: string,
    config: ServerConfig,
    rootDir: string,
  ): void {
    const key = `${languageId}:${rootDir}`;
    const previous = this.states.get(key);

    // Pull restarts forward across broken → starting transitions.
    const previousRestarts =
      previous?.kind === "broken" ? previous.restarts : 0;

    if (previousRestarts >= MAX_RESTARTS_PER_SESSION) {
      const error = new Error(
        `LSP server for ${languageId} exceeded MAX_RESTARTS_PER_SESSION`,
      );
      this.transition(languageId, key, { kind: "crashed-too-often", error });
      return;
    }

    const client = new LspClient({
      serverName: languageId,
      command: config.command,
      args: config.args,
      cwd: rootDir,
      rootUri: fileUriFor(rootDir),
    });

    const promise = (async () => {
      try {
        await client.start();
        this.transition(languageId, key, {
          kind: "running",
          client,
          restarts: previousRestarts + 1,
          rootDir,
        });
      } catch (err) {
        const spawnError = err as SpawnError;
        if (spawnError && spawnError.kind === "missing-binary") {
          this.transition(languageId, key, {
            kind: "missing-binary",
            command: spawnError.command,
          });
        } else {
          const error = err instanceof Error ? err : new Error(String(err));
          this.transition(languageId, key, {
            kind: "broken",
            error,
            cooldownUntil: Date.now() + BROKEN_COOLDOWN_MS,
            restarts: previousRestarts,
          });
        }
      }
    })();

    this.transition(languageId, key, { kind: "starting", promise });
  }

  private transition(
    languageId: string,
    key: string,
    state: ServerState,
  ): void {
    this.states.set(key, state);
    for (const listener of this.listeners) listener(languageId, state);
  }

  /** Whether we've already fired the one-time notification for this state. */
  shouldNotifyMissingBinary(languageId: string): boolean {
    if (this.missingBinaryNotified.has(languageId)) return false;
    this.missingBinaryNotified.add(languageId);
    return true;
  }
  shouldNotifyCrashedTooOften(languageId: string): boolean {
    if (this.crashedNotified.has(languageId)) return false;
    this.crashedNotified.add(languageId);
    return true;
  }
}
```

**Step 2: Type-check**

Run: `make typecheck`
Expected: no errors.

**Step 3: Commit**

```bash
git add pi/agent/extensions/code-feedback/lsp/manager.ts
git commit -m "feat(code-feedback): add lsp manager with state machine"
```

---

## Task 9: Implement `lsp/file-sync.ts` — LRU document tracking

Tracks which documents the LSP server thinks are open, with version numbers and a 100-entry LRU cap.

**Files:**

- Create: `pi/agent/extensions/code-feedback/lsp/file-sync.ts`

**Step 1: Write the file**

```typescript
import { resolve } from "node:path";

import { MAX_TRACKED_DOCUMENTS } from "../constants.js";
import { fileUriFor } from "./client.js";
import { getLspLanguageId } from "./language-map.js";
import { type LspManager } from "./manager.js";

interface TrackedDocument {
  uri: string;
  languageId: string;
  registryId: string;
  version: number;
  /** Server key (`${languageId}:${rootDir}`) so didClose goes to the right server. */
  serverKey: string;
}

/**
 * Tracks open documents per LSP server with an LRU cap. Eviction sends
 * `didClose` so long sessions don't leak memory in jdtls/pyright/gopls.
 *
 * Reads do NOT open documents. Only writes/edits do — see
 * `.designs/2026-04-10-lsp-extension.md` for why.
 */
export class FileSync {
  // Insertion order = LRU. We re-insert on touch.
  private readonly tracked = new Map<string, TrackedDocument>();

  constructor(private readonly manager: LspManager) {}

  /**
   * Notify the LSP that a file has been written/edited. On first call for
   * a URI, sends `didOpen`. On subsequent calls, increments version and
   * sends `didChange`. Returns the URI used (file://...) for the caller's
   * convenience, or null if no LSP server handles the file.
   */
  syncWrite(
    absPath: string,
    content: string,
    registryId: string,
  ): string | null {
    const client = this.manager.getRunningClient(absPath);
    if (!client) return null;

    const uri = fileUriFor(resolve(absPath));
    const lspLanguageId = getLspLanguageId(absPath, registryId);

    const state = this.manager.getState(absPath);
    if (state.kind !== "running") return null;
    const serverKey = `${registryId}:${state.rootDir}`;

    const existing = this.tracked.get(uri);
    if (existing && existing.serverKey === serverKey) {
      existing.version += 1;
      client.changeDocument(uri, existing.version, content);
      this.touch(uri, existing);
      return uri;
    }

    // Either new document or the server identity changed (rare).
    const doc: TrackedDocument = {
      uri,
      languageId: lspLanguageId,
      registryId,
      version: 1,
      serverKey,
    };
    client.openDocument(uri, lspLanguageId, doc.version, content);
    this.tracked.set(uri, doc);
    this.evictIfNeeded();
    return uri;
  }

  private touch(uri: string, doc: TrackedDocument): void {
    // Re-insert to move to the most-recent position.
    this.tracked.delete(uri);
    this.tracked.set(uri, doc);
  }

  private evictIfNeeded(): void {
    while (this.tracked.size > MAX_TRACKED_DOCUMENTS) {
      const oldest = this.tracked.keys().next().value;
      if (!oldest) return;
      const doc = this.tracked.get(oldest);
      this.tracked.delete(oldest);
      if (!doc) continue;
      // Find the running client for this server key and tell it to close.
      // We store enough info to do this without re-resolving the file path.
      // The simplest correct approach: walk all running states and match
      // by serverKey. (At MAX 100 docs and a handful of servers, this is
      // cheap.)
      for (const [key, state] of this.manager.getAllStates()) {
        if (key === doc.serverKey && state.kind === "running") {
          state.client.closeDocument(doc.uri);
          break;
        }
      }
    }
  }

  /** Used by `lsp_diagnostics` for `path: "*"` — all currently-tracked URIs. */
  getTrackedUris(): string[] {
    return Array.from(this.tracked.keys());
  }
}
```

**Step 2: Type-check**

Run: `make typecheck`
Expected: no errors.

**Step 3: Commit**

```bash
git add pi/agent/extensions/code-feedback/lsp/file-sync.ts
git commit -m "feat(code-feedback): add lru document file sync"
```

---

## Task 10: Add diagnostic formatting helper

Pure function. Takes raw LSP `Diagnostic[]`, filters to error severities, caps the count, formats as text. Used by both auto-inject and the explicit tool.

**Files:**

- Create: `pi/agent/extensions/code-feedback/lsp/format-diagnostics.ts`

**Step 1: Write the file**

```typescript
import { relative } from "node:path";
import {
  type Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver-protocol";

import {
  AUTO_INJECT_SEVERITIES,
  MAX_INLINE_ERRORS_PER_FILE,
} from "../constants.js";

/**
 * Formats the auto-inject diagnostic summary appended to write/edit
 * tool_result content. Errors only (per AUTO_INJECT_SEVERITIES). Caps at
 * MAX_INLINE_ERRORS_PER_FILE per file with a "... and N more" tail.
 *
 * Returns `null` if there are no surfaceable diagnostics — caller should
 * not append anything in that case.
 */
export function formatAutoInjectSummary(
  filePath: string,
  cwd: string,
  diagnostics: Diagnostic[],
): string | null {
  const errors = diagnostics.filter(
    (d) => d.severity !== undefined && AUTO_INJECT_SEVERITIES.has(d.severity),
  );
  if (errors.length === 0) return null;

  const relPath = relative(cwd, filePath) || filePath;
  const shown = errors.slice(0, MAX_INLINE_ERRORS_PER_FILE);

  const lines = shown.map((d) => {
    const line = d.range.start.line + 1;
    const col = d.range.start.character + 1;
    const source = d.source ? ` [${d.source}]` : "";
    return `${relPath}:${line}:${col} error: ${d.message}${source}`;
  });

  let header = `⚠ LSP: ${errors.length} error(s) in ${relPath}`;
  if (errors.length > MAX_INLINE_ERRORS_PER_FILE) {
    header += ` (showing first ${MAX_INLINE_ERRORS_PER_FILE})`;
  }
  header += ":";

  let result = `${header}\n${lines.join("\n")}`;
  if (errors.length > MAX_INLINE_ERRORS_PER_FILE) {
    result += `\n... and ${errors.length - MAX_INLINE_ERRORS_PER_FILE} more error(s)`;
  }
  return result;
}

/**
 * Formats diagnostics for the explicit `lsp_diagnostics` tool. Includes
 * ALL severities (not just errors) and uses a wider format with severity
 * labels. Used for both single-file and workspace-wide queries.
 */
export function formatExplicitDiagnostics(
  diagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }>,
  cwd: string,
): string {
  const total = diagnostics.reduce((acc, f) => acc + f.diagnostics.length, 0);
  if (total === 0) return "No diagnostics.";

  const lines: string[] = [];
  for (const file of diagnostics) {
    if (file.diagnostics.length === 0) continue;
    const relPath = uriToRelative(file.uri, cwd);
    lines.push(`\n${relPath} (${file.diagnostics.length}):`);
    for (const d of file.diagnostics) {
      const sev = severityLabel(d.severity);
      const line = d.range.start.line + 1;
      const col = d.range.start.character + 1;
      const source = d.source ? ` [${d.source}]` : "";
      lines.push(`  ${line}:${col} ${sev}: ${d.message}${source}`);
    }
  }
  return lines.join("\n").trim();
}

function severityLabel(severity?: DiagnosticSeverity): string {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return "error";
    case DiagnosticSeverity.Warning:
      return "warning";
    case DiagnosticSeverity.Information:
      return "info";
    case DiagnosticSeverity.Hint:
      return "hint";
    default:
      return "unknown";
  }
}

function uriToRelative(uri: string, cwd: string): string {
  const path = uri.startsWith("file://") ? uri.slice(7) : uri;
  return relative(cwd, path) || path;
}
```

**Step 2: Type-check**

Run: `make typecheck`
Expected: no errors.

**Step 3: Commit**

```bash
git add pi/agent/extensions/code-feedback/lsp/format-diagnostics.ts
git commit -m "feat(code-feedback): add diagnostic formatters"
```

---

## Task 11: Rewrite `index.ts` to orchestrate format → LSP → diagnostics

This is where everything comes together. The existing `tool_result` handler grows from "format" to "format then LSP then maybe inject errors."

**Files:**

- Modify: `pi/agent/extensions/code-feedback/index.ts`

**Step 1: Replace the entire file contents**

```typescript
/**
 * code-feedback extension for Pi.
 *
 * After a successful built-in `write` or `edit` tool result:
 *   1. Autoformat the file (gofmt or prettier — same as the previous
 *      `autoformat` extension this replaces).
 *   2. If a Go or TypeScript/JavaScript file, sync the post-format content
 *      to the language server (lazy-start the server if needed).
 *   3. Wait for the LSP to report diagnostics.
 *   4. Append a summary of *errors only* to the tool_result content so
 *      the model sees them on its next turn.
 *
 * See `.designs/2026-04-10-lsp-extension.md` for the full design rationale.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { LSP_MAX_FILE_BYTES } from "./constants.js";
import { formatGoFile } from "./format/gofmt.js";
import { formatWithPrettier } from "./format/prettier.js";
import {
  getToolPath,
  type NotifyContext,
  logFormattingIssue,
} from "./format/utils.js";
import { formatAutoInjectSummary } from "./lsp/format-diagnostics.js";
import { FileSync } from "./lsp/file-sync.js";
import { getLanguageIdForFile } from "./lsp/language-map.js";
import { LspManager, type ServerState } from "./lsp/manager.js";
import { DEFAULT_SERVERS } from "./lsp/servers.js";

let manager: LspManager | null = null;
let fileSync: FileSync | null = null;

async function autoformatFile(
  filePath: string,
  ctx: NotifyContext,
): Promise<void> {
  const signal = ctx.signal ?? new AbortController().signal;

  await withFileMutationQueue(filePath, async () => {
    if (signal.aborted) return;

    const ext = extname(filePath).toLowerCase();
    if (ext === ".go") {
      await formatGoFile(filePath, signal, ctx);
      return;
    }
    await formatWithPrettier(filePath, signal, ctx);
  });
}

/**
 * Runs the LSP feedback step for a file. Returns the inline summary text
 * to append to the tool_result, or null if no diagnostics should be shown.
 */
async function lspFeedbackForFile(
  absPath: string,
  cwd: string,
): Promise<string | null> {
  if (!manager || !fileSync) return null;

  const registryId = getLanguageIdForFile(absPath);
  if (!registryId || !DEFAULT_SERVERS[registryId]) return null;

  // File size guard.
  try {
    const stats = await stat(absPath);
    if (stats.size > LSP_MAX_FILE_BYTES) return null;
  } catch {
    return null;
  }

  // Trigger lazy start (returns null if not yet running).
  const client = manager.getRunningClient(absPath);
  if (!client) return null;

  // Re-read the (post-format) content from disk.
  let content: string;
  try {
    content = await readFile(absPath, "utf-8");
  } catch {
    return null;
  }

  const uri = fileSync.syncWrite(absPath, content, registryId);
  if (!uri) return null;

  let diagnostics;
  try {
    diagnostics = await client.getDiagnostics(uri);
  } catch (err) {
    console.error(
      "[code-feedback] getDiagnostics failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  return formatAutoInjectSummary(absPath, cwd, diagnostics);
}

function buildStatusLine(states: Map<string, ServerState>): string {
  const byLanguage = new Map<string, ServerState>();
  for (const [key, state] of states) {
    const languageId = key.split(":", 1)[0];
    // Pick the most informative state if multiple roots exist.
    const previous = byLanguage.get(languageId);
    if (
      !previous ||
      state.kind === "running" ||
      previous.kind === "not-started"
    ) {
      byLanguage.set(languageId, state);
    }
  }

  const allLanguages = Object.keys(DEFAULT_SERVERS);
  const parts = allLanguages.map((languageId) => {
    const state = byLanguage.get(languageId);
    if (!state) return null; // never touched a file of this language
    switch (state.kind) {
      case "running":
        return `${languageId} ✓`;
      case "starting":
        return `${languageId} …`;
      case "missing-binary":
        return `${languageId} ✗ (${state.command} missing)`;
      case "broken":
        return `${languageId} ✗ (broken)`;
      case "crashed-too-often":
        return `${languageId} ✗ (crashed)`;
      default:
        return null;
    }
  });
  const visible = parts.filter((p): p is string => p !== null);
  if (visible.length === 0) return "";
  return `LSP: ${visible.join(" | ")}`;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    manager = new LspManager();
    fileSync = new FileSync(manager);

    // One-time TUI notifications on the first transition into bad states.
    manager.onStateChange((languageId, state) => {
      if (!ctx.hasUI) return;
      if (state.kind === "missing-binary") {
        if (manager?.shouldNotifyMissingBinary(languageId)) {
          const config = DEFAULT_SERVERS[languageId];
          ctx.ui.notify(
            `[code-feedback] ${state.command} not found on PATH. ` +
              `${languageId} diagnostics disabled for this session. ` +
              (config?.installHint ?? ""),
            "warning",
          );
        }
      } else if (state.kind === "crashed-too-often") {
        if (manager?.shouldNotifyCrashedTooOften(languageId)) {
          ctx.ui.notify(
            `[code-feedback] LSP server for ${languageId} crashed too many ` +
              `times this session and has been disabled. Last error: ${state.error.message}`,
            "error",
          );
        }
      }
    });
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const path = getToolPath(event);
    if (!path) return;

    const first = event.content?.[0];
    if (
      first?.type === "text" &&
      typeof first.text === "string" &&
      first.text.startsWith("Error")
    ) {
      return;
    }

    const absPath = resolve(ctx.cwd, path);

    // Step 1: autoformat
    try {
      await autoformatFile(absPath, ctx as NotifyContext);
    } catch (error) {
      logFormattingIssue(
        ctx as NotifyContext,
        `Autoformat failed for ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Step 2: LSP feedback
    const lspSummary = await lspFeedbackForFile(absPath, ctx.cwd);
    if (lspSummary) {
      return {
        content: [
          ...event.content,
          { type: "text" as const, text: `\n\n${lspSummary}` },
        ],
      };
    }
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    if (!manager || !ctx.hasUI) return;
    const status = buildStatusLine(manager.getAllStates());
    if (status) ctx.ui.setStatus("code-feedback", status);
  });

  pi.on("session_shutdown", async () => {
    if (manager) {
      await manager.shutdownAll();
      manager = null;
      fileSync = null;
    }
  });
}
```

**Step 2: Type-check**

Run: `make typecheck`
Expected: no errors. If you see complaints about unused imports (`pi.registerTool` not used yet), that's fine — Tasks 12 and 13 add them.

**Step 3: Smoke test (Go)**

Open a Pi session in any Go module directory (any project with a `go.mod`). Edit a `.go` file with bad formatting AND a deliberate syntax error, e.g.:

```go
package main
import "fmt"
func main(){fmt.Println(undefined_variable)}
```

Expected:

- Autoformat runs (you'll see indentation fixed)
- After a brief pause, the tool_result content includes a `⚠ LSP: 1 error(s)` block with the `undefined_variable` error
- TUI status line shows `LSP: go ✓`

If the first edit produces no LSP output (because gopls is still starting), edit the file again — the second edit should show the error.

If `gopls` is missing on the system, expected: a one-time TUI notification with the install hint, status line shows `LSP: go ✗ (gopls missing)`, and subsequent Go edits don't append LSP output.

**Step 4: Smoke test (TypeScript)**

In any TS project (with `tsconfig.json`), edit a `.ts` file with a deliberate type error, e.g.:

```typescript
const x: number = "not a number";
```

Expected: same flow as Go, with `tsserver`-sourced error in the appended block.

**Step 5: Commit**

```bash
git add pi/agent/extensions/code-feedback/index.ts
git commit -m "feat(code-feedback): orchestrate format and lsp feedback"
```

---

## Task 12: Implement the `lsp_diagnostics` tool

Explicit tool the model can call. Single-file or workspace-wide. Returns all severities (unlike auto-inject which is errors only).

**Files:**

- Create: `pi/agent/extensions/code-feedback/tools/lsp-diagnostics.ts`

**Step 1: Write the file**

```typescript
import { Type, type Static } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolve } from "node:path";

import { EXPLICIT_TOOL_BLOCK_TIMEOUT_MS } from "../timing.js";
import { fileUriFor } from "../lsp/client.js";
import { type FileSync } from "../lsp/file-sync.js";
import { formatExplicitDiagnostics } from "../lsp/format-diagnostics.js";
import { getLanguageIdForFile } from "../lsp/language-map.js";
import { type LspManager } from "../lsp/manager.js";
import { DEFAULT_SERVERS } from "../lsp/servers.js";

const params = Type.Object({
  path: Type.String({
    description:
      "File path relative to the working directory. Use '*' for workspace-wide diagnostics across all files the LSP currently knows about.",
  }),
});

interface Deps {
  getManager: () => LspManager | null;
  getFileSync: () => FileSync | null;
}

export function registerLspDiagnosticsTool(pi: ExtensionAPI, deps: Deps): void {
  pi.registerTool({
    name: "lsp_diagnostics",
    label: "LSP Diagnostics",
    description:
      "Returns LSP diagnostics (errors, warnings, info, hints) for a file or for the entire workspace. Use after making changes to verify nothing is broken, or to investigate the current state of a file.",
    parameters: params,

    async execute(
      _toolCallId,
      input: Static<typeof params>,
      _signal,
      _onUpdate,
      ctx,
    ) {
      const manager = deps.getManager();
      const fileSync = deps.getFileSync();
      if (!manager || !fileSync) {
        return {
          content: [
            {
              type: "text" as const,
              text: "code-feedback extension is not initialized.",
            },
          ],
          details: {},
        };
      }

      // Workspace-wide
      if (input.path === "*") {
        const uris = fileSync.getTrackedUris();
        const collected: Array<{ uri: string; diagnostics: any[] }> = [];
        for (const uri of uris) {
          // Find the running client that owns this URI.
          for (const [, state] of manager.getAllStates()) {
            if (state.kind !== "running") continue;
            const cached = state.client.getCachedDiagnostics(uri);
            if (cached.length > 0) {
              collected.push({ uri, diagnostics: cached });
              break;
            }
          }
        }
        const text = formatExplicitDiagnostics(collected, ctx.cwd);
        return {
          content: [{ type: "text" as const, text }],
          details: { mode: "workspace", fileCount: collected.length },
        };
      }

      // Single-file
      const cleanedPath = input.path.replace(/^@/, "");
      const absPath = resolve(ctx.cwd, cleanedPath);

      const registryId = getLanguageIdForFile(absPath);
      if (!registryId || !DEFAULT_SERVERS[registryId]) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No LSP server is configured for ${input.path}.`,
            },
          ],
          details: {},
        };
      }

      // Wait for the server to be running, blocking up to the timeout.
      const start = Date.now();
      let client = manager.getRunningClient(absPath);
      while (!client && Date.now() - start < EXPLICIT_TOOL_BLOCK_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, 100));
        client = manager.getRunningClient(absPath);
      }

      const state = manager.getState(absPath);
      if (state.kind === "missing-binary") {
        const config = DEFAULT_SERVERS[registryId];
        return {
          content: [
            {
              type: "text" as const,
              text:
                `LSP server '${state.command}' is not installed on this system. ` +
                `${registryId} diagnostics and navigation are unavailable this session. ` +
                `${config?.installHint ?? ""}`,
            },
          ],
          details: { state: "missing-binary" },
        };
      }
      if (state.kind === "crashed-too-often") {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `LSP server for ${registryId} has crashed too many times this session and is disabled. ` +
                `Last error: ${state.error.message}`,
            },
          ],
          details: { state: "crashed-too-often" },
        };
      }
      if (!client) {
        return {
          content: [
            {
              type: "text" as const,
              text: `LSP server for ${registryId} is still starting up. Try again in a moment.`,
            },
          ],
          details: { state: state.kind },
        };
      }

      const uri = fileUriFor(absPath);
      const diagnostics = await client.getDiagnostics(uri);
      const text = formatExplicitDiagnostics([{ uri, diagnostics }], ctx.cwd);
      return {
        content: [{ type: "text" as const, text }],
        details: { mode: "single", count: diagnostics.length },
      };
    },
  });
}
```

**Step 2: Wire it into `index.ts`**

In `pi/agent/extensions/code-feedback/index.ts`, add an import near the others:

```typescript
import { registerLspDiagnosticsTool } from "./tools/lsp-diagnostics.js";
```

Inside the default export function, after the `pi.on("session_start", ...)` registration but before `pi.on("tool_result", ...)`, add:

```typescript
registerLspDiagnosticsTool(pi, {
  getManager: () => manager,
  getFileSync: () => fileSync,
});
```

**Step 3: Type-check**

Run: `make typecheck`
Expected: no errors.

**Step 4: Smoke test**

In a Pi session, after editing a Go or TS file (so the server is running), ask the agent to call `lsp_diagnostics` with `path: "*"`. Verify the model sees the workspace-wide list.

Then ask it to call `lsp_diagnostics` with the path to a known-good file. Verify it returns "No diagnostics."

Then call it on a file in a language that has no configured server (e.g., a `.md` file). Verify the response is "No LSP server is configured for ...".

**Step 5: Commit**

```bash
git add pi/agent/extensions/code-feedback/tools/lsp-diagnostics.ts pi/agent/extensions/code-feedback/index.ts
git commit -m "feat(code-feedback): add lsp_diagnostics tool"
```

---

## Task 13: Implement the `lsp_navigation` tool

Single tool with an `operation` discriminator. Wraps the navigation methods on `LspClient`.

**Files:**

- Create: `pi/agent/extensions/code-feedback/tools/lsp-navigation.ts`

**Step 1: Write the file**

```typescript
import { Type, type Static } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type DocumentSymbol,
  type Hover,
  type Location,
  type LocationLink,
  type SymbolInformation,
} from "vscode-languageserver-protocol";

import { EXPLICIT_TOOL_BLOCK_TIMEOUT_MS } from "../timing.js";
import { fileUriFor } from "../lsp/client.js";
import { getLanguageIdForFile } from "../lsp/language-map.js";
import { type LspManager } from "../lsp/manager.js";
import { DEFAULT_SERVERS } from "../lsp/servers.js";

const params = Type.Object({
  operation: Type.Union(
    [
      Type.Literal("definition"),
      Type.Literal("references"),
      Type.Literal("hover"),
      Type.Literal("documentSymbol"),
      Type.Literal("workspaceSymbol"),
    ],
    {
      description:
        "Which LSP navigation operation to perform. 'workspaceSymbol' takes a query string; the others take a file path and (for definition/references/hover) a position.",
    },
  ),
  filePath: Type.Optional(
    Type.String({
      description:
        "File path relative to working directory. Required for all operations except 'workspaceSymbol'.",
    }),
  ),
  line: Type.Optional(
    Type.Number({
      description:
        "1-based line number. Required for 'definition', 'references', 'hover'.",
    }),
  ),
  character: Type.Optional(
    Type.Number({
      description:
        "1-based column number. Required for 'definition', 'references', 'hover'.",
    }),
  ),
  query: Type.Optional(
    Type.String({
      description: "Symbol name or substring. Required for 'workspaceSymbol'.",
    }),
  ),
});

interface Deps {
  getManager: () => LspManager | null;
}

export function registerLspNavigationTool(pi: ExtensionAPI, deps: Deps): void {
  pi.registerTool({
    name: "lsp_navigation",
    label: "LSP Navigation",
    description:
      "Provides LSP-powered code navigation: jump to definition, find references, hover for type info, list document symbols, or search workspace symbols. Use this instead of grep when you need precise semantic results.",
    parameters: params,

    async execute(
      _toolCallId,
      input: Static<typeof params>,
      _signal,
      _onUpdate,
      ctx,
    ) {
      const manager = deps.getManager();
      if (!manager) {
        return {
          content: [
            {
              type: "text" as const,
              text: "code-feedback extension is not initialized.",
            },
          ],
          details: {},
        };
      }

      // workspaceSymbol takes a different path — it doesn't need a file.
      if (input.operation === "workspaceSymbol") {
        if (!input.query) {
          return errorResult("workspaceSymbol requires `query`.");
        }
        // Find any running client to ask. Prefer the first one.
        let client = null;
        for (const [, state] of manager.getAllStates()) {
          if (state.kind === "running") {
            client = state.client;
            break;
          }
        }
        if (!client) {
          return errorResult(
            "No LSP server is currently running. Edit a file in a supported language first.",
          );
        }
        const symbols = (await client.workspaceSymbol(input.query)) ?? [];
        return {
          content: [
            {
              type: "text" as const,
              text: formatWorkspaceSymbols(symbols, ctx.cwd),
            },
          ],
          details: { count: symbols.length },
        };
      }

      // All other operations need a file path.
      if (!input.filePath) {
        return errorResult(`${input.operation} requires \`filePath\`.`);
      }
      const absPath = resolve(ctx.cwd, input.filePath.replace(/^@/, ""));
      const registryId = getLanguageIdForFile(absPath);
      if (!registryId || !DEFAULT_SERVERS[registryId]) {
        return errorResult(
          `No LSP server is configured for ${input.filePath}.`,
        );
      }

      // Block-with-timeout for the server.
      const start = Date.now();
      let client = manager.getRunningClient(absPath);
      while (!client && Date.now() - start < EXPLICIT_TOOL_BLOCK_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, 100));
        client = manager.getRunningClient(absPath);
      }
      const state = manager.getState(absPath);
      if (state.kind === "missing-binary") {
        return errorResult(
          `LSP server '${state.command}' is not installed. ${
            DEFAULT_SERVERS[registryId]?.installHint ?? ""
          }`,
        );
      }
      if (state.kind === "crashed-too-often") {
        return errorResult(
          `LSP server for ${registryId} crashed too many times this session and is disabled.`,
        );
      }
      if (!client) {
        return errorResult(
          `LSP server for ${registryId} is still starting up. Try again in a moment.`,
        );
      }

      const uri = fileUriFor(absPath);

      switch (input.operation) {
        case "documentSymbol": {
          const result = (await client.documentSymbol(uri)) ?? [];
          return {
            content: [
              {
                type: "text" as const,
                text: formatDocumentSymbols(result, input.filePath),
              },
            ],
            details: { count: result.length },
          };
        }
        case "definition":
        case "references":
        case "hover": {
          if (input.line === undefined || input.character === undefined) {
            return errorResult(
              `${input.operation} requires \`line\` and \`character\`.`,
            );
          }
          // 1-based → 0-based for LSP.
          const position = {
            line: input.line - 1,
            character: input.character - 1,
          };
          if (input.operation === "definition") {
            const result = await client.definition(uri, position);
            return {
              content: [
                {
                  type: "text" as const,
                  text: formatLocations(result, ctx.cwd, "definition"),
                },
              ],
              details: {},
            };
          }
          if (input.operation === "references") {
            const result = await client.references(uri, position);
            return {
              content: [
                {
                  type: "text" as const,
                  text: formatLocations(result, ctx.cwd, "references"),
                },
              ],
              details: {},
            };
          }
          // hover
          const result = await client.hover(uri, position);
          return {
            content: [{ type: "text" as const, text: formatHover(result) }],
            details: {},
          };
        }
      }
    },
  });
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: {},
  };
}

function uriToRel(uri: string, cwd: string): string {
  const path = uri.startsWith("file://") ? fileURLToPath(uri) : uri;
  return relative(cwd, path) || path;
}

function formatLocations(
  result: Location[] | LocationLink[] | null,
  cwd: string,
  label: string,
): string {
  if (!result || (Array.isArray(result) && result.length === 0)) {
    return `No ${label} found.`;
  }
  const arr = Array.isArray(result) ? result : [result];
  const lines = arr.map((loc) => {
    // LocationLink has targetUri / targetRange; Location has uri / range.
    const uri = "targetUri" in loc ? loc.targetUri : loc.uri;
    const range = "targetRange" in loc ? loc.targetRange : loc.range;
    const rel = uriToRel(uri, cwd);
    const line = range.start.line + 1;
    const col = range.start.character + 1;
    return `${rel}:${line}:${col}`;
  });
  return lines.join("\n");
}

function formatHover(hover: Hover | null): string {
  if (!hover) return "No hover information available.";
  const c = hover.contents;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part) => (typeof part === "string" ? part : part.value))
      .join("\n");
  }
  if ("value" in c) return c.value;
  return "No hover information available.";
}

function formatDocumentSymbols(
  symbols: DocumentSymbol[] | SymbolInformation[],
  filePath: string,
): string {
  if (symbols.length === 0) return `No symbols in ${filePath}.`;
  // Both DocumentSymbol and SymbolInformation have `name` and a kind.
  const lines = symbols.map((s) => {
    const name = s.name;
    const range = "range" in s ? s.range : s.location.range;
    const line = range.start.line + 1;
    return `${filePath}:${line} ${name}`;
  });
  return lines.join("\n");
}

function formatWorkspaceSymbols(
  symbols: SymbolInformation[],
  cwd: string,
): string {
  if (symbols.length === 0) return "No symbols found.";
  return symbols
    .slice(0, 50) // cap to keep response sane
    .map((s) => {
      const rel = uriToRel(s.location.uri, cwd);
      const line = s.location.range.start.line + 1;
      return `${rel}:${line} ${s.name}`;
    })
    .join("\n");
}
```

**Step 2: Wire it into `index.ts`**

Add to imports in `pi/agent/extensions/code-feedback/index.ts`:

```typescript
import { registerLspNavigationTool } from "./tools/lsp-navigation.js";
```

After the `registerLspDiagnosticsTool(...)` call inside the default export, add:

```typescript
registerLspNavigationTool(pi, {
  getManager: () => manager,
});
```

**Step 3: Type-check**

Run: `make typecheck`
Expected: no errors.

**Step 4: Smoke test**

In a Pi session in a TypeScript or Go project:

1. Ask the agent to call `lsp_navigation` with `operation: "documentSymbol"` on a file with several functions. Verify it returns a list of symbol names.
2. Pick one symbol from that list and ask the agent to call `lsp_navigation` with `operation: "definition"`, `filePath: <file>`, `line: <line>`, `character: <char of the symbol>`. Verify it returns a path:line:col location.
3. Ask the agent to call `lsp_navigation` with `operation: "workspaceSymbol"` and a query. Verify it returns matching symbols across the project.
4. Ask the agent to call `lsp_navigation` with `operation: "hover"` on the same position. Verify it returns type/doc info.

**Step 5: Commit**

```bash
git add pi/agent/extensions/code-feedback/tools/lsp-navigation.ts pi/agent/extensions/code-feedback/index.ts
git commit -m "feat(code-feedback): add lsp_navigation tool"
```

---

## Task 14: End-to-end smoke test pass

Run a complete real-world session and validate the full flow works as designed.

**No files modified — this is a verification task.**

**Step 1: Smoke test, Go project**

Find or create a small Go module with a few `.go` files. Start a Pi session in that directory.

1. Ask Pi to add a new function to one of the files that intentionally has a type error. Verify:
   - File is gofmt'd in the diff
   - Tool result includes `⚠ LSP: 1 error(s)` block with the type error
   - Status line shows `LSP: go ✓`
2. Ask Pi to fix the error. Verify the next tool result has no LSP block.
3. Ask Pi to call `lsp_diagnostics` with `path: "*"`. Verify it reports no diagnostics.
4. Ask Pi to use `lsp_navigation` to find the definition of a stdlib function (e.g. `fmt.Println`). Verify it returns a location in `$GOROOT/src/fmt/print.go`.

**Step 2: Smoke test, TypeScript project**

Find or create a TS project with a `tsconfig.json`. Start a Pi session.

1. Ask Pi to add a function with a deliberate type error. Verify the error is appended to the tool result.
2. Use `lsp_navigation` `documentSymbol` on a file. Verify the symbol list looks correct.
3. Use `lsp_navigation` `workspaceSymbol` with a query. Verify it returns matches.

**Step 3: Smoke test, missing binary**

Temporarily move `gopls` out of PATH (or pretend you don't have it):

```bash
which gopls   # note the path
mv $(which gopls) /tmp/gopls.bak
```

Start a Pi session in a Go project. Ask Pi to edit a `.go` file. Verify:

- Autoformat (gofmt) still runs — gofmt is a separate code path from gopls
- TUI shows a one-time notification: `[code-feedback] gopls not found on PATH...`
- Status line shows `LSP: go ✗ (gopls missing)`
- The tool result has NO LSP block (we don't spam the model on every Go edit)
- Asking Pi to call `lsp_diagnostics` on a Go file returns the install hint

Restore: `mv /tmp/gopls.bak $(which gopls 2>/dev/null || echo /usr/local/bin/gopls)`

**Step 4: Smoke test, restart cooldown**

This one's hard to trigger naturally. Skip if you can't easily kill the gopls process during a session. If you can: kill `gopls` mid-session, then immediately edit a `.go` file. Expected: the next edit (or one shortly after) triggers a restart attempt, eventually succeeds. After 3 forced kills, status line should show `LSP: go ✗ (crashed)` and a notification fires.

**Step 5: Document any rough edges**

If anything didn't behave as expected, write the issue down and decide whether to fix it now (extending this plan) or defer to a follow-up task. Common things to look for:

- Auto-inject summary appearing on the wrong tool calls
- Diagnostics from a previous version of the file (stale cache)
- LSP servers not shutting down cleanly at session end (orphan processes — `ps aux | grep gopls` after exit)
- TUI status line not updating

**No commit for this task** unless you fixed something — in which case commit those fixes with a `fix(code-feedback): ...` message.

---

## Task 15: Update documentation

Final task: anything that referenced the old `autoformat` extension needs to be updated to mention `code-feedback`.

**Files to check:**

- `pi/README.md` — has an extensions table that lists `autoformat`. Update the row.
- `README.md` (root) — line 19 mentions "Auto-formatting on write" and line 23 mentions extensions. May need rewording.
- `pi/agent/extensions/code-feedback/README.md` — was moved from `autoformat/`. Needs a rewrite to describe the new scope.
- Search for any other references: `grep -r autoformat .` (excluding `node_modules`, `.git`).

**Step 1: Update `pi/agent/extensions/code-feedback/README.md`**

Replace the contents with:

```markdown
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
```

**Step 2: Update `pi/README.md`**

Find the row in the extensions table:

```
| `autoformat`             | Auto-run gofmt and prettier on edited files    |
```

Replace it with:

```
| `code-feedback`          | Auto-format and surface LSP errors after edits |
```

**Step 3: Check the root README**

Read `README.md` and check whether line 19 ("Auto-formatting on write") still makes sense. The text describes a Claude Code PostToolUse hook, not the Pi extension, so it's likely fine — but verify. Line 23 mentions Pi extensions generically; no change needed.

**Step 4: Search for stragglers**

Run:

```bash
grep -rn "autoformat" pi/ claude/ README.md Makefile 2>/dev/null | grep -v node_modules
```

For each match, decide whether it's stale (update it) or a generic word (leave it). Note that the `__tests__` and `.git` directories should be excluded if found.

**Step 5: Type-check (sanity)**

Run: `make typecheck`
Expected: no errors. (Doc changes shouldn't affect this, but it's a cheap sanity check.)

**Step 6: Commit**

```bash
git add pi/agent/extensions/code-feedback/README.md pi/README.md
# plus any other doc files modified in step 4
git commit -m "docs(code-feedback): update extension docs"
```

---

## Final notes

- After the last task, the new extension is functionally complete and the old `autoformat` is gone.
- All commits should have passed `make typecheck` before they were created.
- If a task's smoke test fails, **stop and diagnose before proceeding**. Do not advance to the next task until the current one works in a real Pi session.
- The design document (`.designs/2026-04-10-lsp-extension.md`) is the source of truth for any decision not spelled out here. Re-read it whenever you're unsure about a design choice.
- All paths in this plan are relative to the repo root; the implementer should be at the repo root when running commands.
