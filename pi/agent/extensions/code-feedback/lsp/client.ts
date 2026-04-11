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
