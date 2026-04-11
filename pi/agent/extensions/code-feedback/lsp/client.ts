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

import {
  INITIALIZE_TIMEOUT_MS,
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
  /**
   * Invoked when the server process exits unexpectedly (not via graceful
   * `stop()`). Used by `LspManager` to transition from `running` to
   * `broken` and allow retry after cooldown.
   */
  onCrash?: (error: Error) => void;
  /**
   * Invoked whenever the server reports a severity-Error message via
   * `window/showMessage` or `window/logMessage`. Used by `LspManager` to
   * forward the message to the UI so the user sees why a server is
   * complaining (e.g. gopls's "cannot find main module" warning).
   */
  onServerError?: (message: string) => void;
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
  private lastErrorMessage: string | null = null;
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

    // LANDMINE #1: patch stdin.write so fire-and-forget writes can never
    // produce unhandled promise rejections, even when the server dies
    // mid-write.
    //
    // The naive "bail if stdin.destroyed" guard is insufficient because
    // there is a window where the OS pipe is already broken but Node
    // hasn't yet marked the local stream as destroyed. In that window,
    // `originalWrite` hands the payload to Node's stream machinery,
    // `afterWriteDispatched` constructs `Error: write EPIPE`, and that
    // error is delivered to the write callback that vscode-jsonrpc's
    // `ril.js` uses to reject its write Promise. Something inside
    // vscode-jsonrpc's own plumbing doesn't always `.catch()` that
    // rejected promise, and the unhandled rejection crashes the host.
    //
    // Defense in depth:
    //   1. Bail if `!stdin.writable`, which covers destroyed, ended,
    //      and errored-but-not-yet-destroyed states in one check.
    //   2. Wrap the caller's write callback so expected post-crash
    //      errors (EPIPE / ECONNRESET / ERR_STREAM_DESTROYED) are
    //      reported as successful writes. vscode-jsonrpc's write
    //      Promise then resolves instead of rejecting. Losing the
    //      payload is acceptable — the exit handler disposes the
    //      connection moments later anyway.
    //   3. try/catch around originalWrite in case any future Node
    //      version synchronously throws these errors.
    const stdin = proc.stdin;
    const originalWrite = stdin.write.bind(stdin);
    const isExpectedPostCrashError = (code: string | undefined): boolean =>
      code === "EPIPE" ||
      code === "ECONNRESET" ||
      code === "ERR_STREAM_DESTROYED";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stdin as any).write = function (...args: any[]): boolean {
      if (!stdin.writable) {
        const cb = args[args.length - 1];
        if (typeof cb === "function") process.nextTick(cb);
        return false;
      }
      const lastArg = args[args.length - 1];
      const wrappedArgs =
        typeof lastArg === "function"
          ? [
              ...args.slice(0, -1),
              (err?: NodeJS.ErrnoException | null) => {
                if (err && isExpectedPostCrashError(err.code)) {
                  lastArg(null);
                  return;
                }
                lastArg(err);
              },
            ]
          : args;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return (originalWrite as any)(...wrappedArgs);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (isExpectedPostCrashError(code)) {
          if (typeof lastArg === "function") process.nextTick(lastArg);
          return false;
        }
        throw err;
      }
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
      const error = new Error(
        `LSP server ${this.options.serverName} exited unexpectedly (code=${code}, signal=${signal})`,
      );
      console.error(`[code-feedback/lsp] ${error.message}`);
      this.connection?.dispose();
      this.connection = null;
      try {
        this.options.onCrash?.(error);
      } catch (err) {
        console.error(
          `[code-feedback/lsp] onCrash handler threw:`,
          err instanceof Error ? err.message : err,
        );
      }
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

    // window/showMessage and window/logMessage — surface server-reported
    // errors (e.g. gopls "cannot find main module") instead of silently
    // swallowing them. MessageType: 1=Error, 2=Warning, 3=Info, 4=Log.
    // We only store and forward severity-Error messages; warnings are
    // too noisy for the UI, and logMessage at Info/Log level is spammy.
    this.connection.onNotification(
      "window/showMessage",
      (params: { type: number; message: string }) => {
        this.handleServerMessage(params.type, params.message, "showMessage");
      },
    );
    this.connection.onNotification(
      "window/logMessage",
      (params: { type: number; message: string }) => {
        this.handleServerMessage(params.type, params.message, "logMessage");
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

    // Race the initialize request against a hard deadline. Without this,
    // a server whose initialize handler hangs (gopls on a broken workspace,
    // for instance) would leave us stuck in `starting` forever.
    let initTimer: NodeJS.Timeout | undefined;
    try {
      const initPromise = this.connection.sendRequest<InitializeResult>(
        "initialize",
        initParams,
      );
      const timeoutPromise = new Promise<never>((_, reject) => {
        initTimer = setTimeout(() => {
          reject(
            new Error(
              `LSP server ${this.options.serverName} did not respond to initialize within ${INITIALIZE_TIMEOUT_MS}ms`,
            ),
          );
        }, INITIALIZE_TIMEOUT_MS);
      });
      const initResult = await Promise.race([initPromise, timeoutPromise]);
      this.capabilities = initResult.capabilities;
      await this.connection.sendNotification("initialized", {});
    } catch (err) {
      // Init failed (either a protocol error or our timeout). Tear down the
      // hung/broken process so we don't leak it, then enrich the error with
      // anything the server reported via window/showMessage so the caller
      // can show the model a meaningful reason instead of a bare timeout.
      this.isStopping = true;
      try {
        this.connection?.dispose();
      } catch {
        /* ignore */
      }
      this.connection = null;
      if (this.process && !this.process.killed) {
        this.process.kill("SIGKILL");
      }
      this.process = null;
      const baseMessage = err instanceof Error ? err.message : String(err);
      const hint = this.lastErrorMessage
        ? ` (server reported: ${this.lastErrorMessage})`
        : "";
      throw new Error(baseMessage + hint);
    } finally {
      if (initTimer) clearTimeout(initTimer);
    }
  }

  /**
   * Handles a `window/showMessage` or `window/logMessage` notification.
   * Stores severity-Error messages so they can be surfaced via init
   * failure reports and the `onServerError` callback, and logs non-log
   * messages to the console for post-hoc debugging.
   */
  private handleServerMessage(
    type: number,
    message: string,
    source: string,
  ): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    // Log-level (type 4) is pure debug spam — drop it entirely.
    if (type === 4) return;
    if (type !== 1) {
      // Warning / Info — log to console but don't escalate to UI.
      console.error(
        `[code-feedback/lsp] ${this.options.serverName} ${source} (type=${type}):`,
        trimmed,
      );
      return;
    }
    // Error. Remember it for init-failure enrichment and fan out to the
    // manager's callback.
    this.lastErrorMessage = trimmed;
    console.error(
      `[code-feedback/lsp] ${this.options.serverName} ${source} error:`,
      trimmed,
    );
    try {
      this.options.onServerError?.(trimmed);
    } catch (err) {
      console.error(
        `[code-feedback/lsp] onServerError handler threw:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  /** Most recent severity-Error message reported by the server, if any. */
  getLastErrorMessage(): string | null {
    return this.lastErrorMessage;
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

  /** Sends `textDocument/didOpen`. */
  openDocument(
    uri: string,
    languageId: string,
    version: number,
    text: string,
  ): void {
    if (!this.connection) return;
    this.connection
      .sendNotification("textDocument/didOpen", {
        textDocument: { uri, languageId, version, text },
      })
      .catch(() => {});
  }

  /**
   * Sends `textDocument/didChange` with full-content sync. Incremental sync
   * is not implemented — full-content is simpler and matches both pi-lens
   * and pi-lsp-extension.
   */
  changeDocument(uri: string, version: number, text: string): void {
    if (!this.connection) return;
    this.connection
      .sendNotification("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      })
      .catch(() => {});
  }

  /** Sends `textDocument/didClose`. */
  closeDocument(uri: string): void {
    if (!this.connection) return;
    this.connection
      .sendNotification("textDocument/didClose", {
        textDocument: { uri },
      })
      .catch(() => {});
  }

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
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("pull-mode diagnostic timed out")),
        PULL_MODE_HARD_TIMEOUT_MS,
      );
    });
    try {
      const result = await Promise.race([
        this.connection.sendRequest<{
          kind: "full" | "unchanged";
          items?: Diagnostic[];
        }>("textDocument/diagnostic", {
          textDocument: { uri },
        }),
        timeoutPromise,
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
    } finally {
      clearTimeout(timer!);
    }
  }

  private async getDiagnosticsPushMode(uri: string): Promise<Diagnostic[]> {
    // Wait for the first publishDiagnostics, then debounce for follow-ups.
    // Hard cap at PUSH_HARD_TIMEOUT_MS.
    const start = Date.now();

    const firstNotification = new Promise<void>((resolve) => {
      let timer: NodeJS.Timeout;
      const onUpdate = () => {
        this.diagnosticEmitter.off(uri, onUpdate);
        clearTimeout(timer);
        resolve();
      };
      this.diagnosticEmitter.on(uri, onUpdate);
      timer = setTimeout(() => {
        this.diagnosticEmitter.off(uri, onUpdate);
        resolve();
      }, PUSH_FIRST_NOTIFICATION_TIMEOUT_MS);
    });

    await firstNotification;

    // Debounce: wait `PUSH_DEBOUNCE_MS` after the most recent notification,
    // capped by `PUSH_HARD_TIMEOUT_MS` total.
    let lastSeen = Date.now();
    const onUpdate = () => {
      lastSeen = Date.now();
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
  async references(
    uri: string,
    position: Position,
  ): Promise<Location[] | null> {
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
}

/** Builds the `file://` URI from an absolute filesystem path. */
export function fileUriFor(absPath: string): string {
  return pathToFileURL(absPath).href;
}
