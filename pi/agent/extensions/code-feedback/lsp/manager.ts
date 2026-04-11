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

export type ServerErrorListener = (languageId: string, message: string) => void;

/**
 * Per-(language, root) LSP server lifecycle. Lazy-start on first
 * write/edit of a matching file. Never started by `read` operations.
 */
export class LspManager {
  // Key: `${languageId}:${rootDir}`
  private readonly states = new Map<string, ServerState>();
  private readonly listeners = new Set<StateChangeListener>();
  private readonly serverErrorListeners = new Set<ServerErrorListener>();
  private readonly missingBinaryNotified = new Set<string>();
  private readonly crashedNotified = new Set<string>();
  private readonly notifiedServerErrors = new Set<string>();

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
   * Single-call variant of `getRunningClient` that also returns the
   * workspace root and the internal state key. Returns `null` if the
   * server for this file isn't in the `running` state. Unlike
   * `getRunningClient`, this does NOT trigger lazy start on `not-started`
   * or `broken` states — use `getRunningClient` for that effect.
   */
  lookupRunning(
    filePath: string,
  ): { client: LspClient; rootDir: string; key: string } | null {
    const languageId = getLanguageIdForFile(filePath);
    if (!languageId) return null;
    const config = DEFAULT_SERVERS[languageId];
    if (!config) return null;
    const root = this.resolveRoot(filePath, config.rootMarkers);
    if (!root) return null;
    const key = `${languageId}:${root}`;
    const state = this.states.get(key);
    if (!state || state.kind !== "running") return null;
    return { client: state.client, rootDir: root, key };
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

  onServerError(listener: ServerErrorListener): () => void {
    this.serverErrorListeners.add(listener);
    return () => this.serverErrorListeners.delete(listener);
  }

  /**
   * True the first time a given (language, message) pair is seen in this
   * session. Callers use this to dedupe UI notifications for repeating
   * server errors.
   */
  shouldNotifyServerError(languageId: string, message: string): boolean {
    const key = `${languageId}::${message}`;
    if (this.notifiedServerErrors.has(key)) return false;
    this.notifiedServerErrors.add(key);
    return true;
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
   * Called by an `LspClient` via `onCrash` when its process exits
   * unexpectedly. Transitions the `running` state to `broken` so that
   * the next edit of a matching file triggers a retry after the cooldown.
   */
  handleClientCrash(key: string, error: Error): void {
    const state = this.states.get(key);
    if (!state || state.kind !== "running") return;
    const languageId = key.split(":", 1)[0];
    this.transition(languageId, key, {
      kind: "broken",
      error,
      cooldownUntil: Date.now() + BROKEN_COOLDOWN_MS,
      restarts: state.restarts,
    });
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

    // Pull attempt count forward across broken → starting and running → starting
    // transitions so that both init failures and runtime crashes count toward
    // MAX_RESTARTS_PER_SESSION.
    const previousAttempts =
      previous?.kind === "broken"
        ? previous.restarts
        : previous?.kind === "running"
          ? previous.restarts
          : 0;

    if (previousAttempts >= MAX_RESTARTS_PER_SESSION) {
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
      onCrash: (error) => this.handleClientCrash(key, error),
      onServerError: (message) => this.handleServerError(languageId, message),
    });

    const promise = (async () => {
      try {
        await client.start();
        this.transition(languageId, key, {
          kind: "running",
          client,
          restarts: previousAttempts + 1,
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
            restarts: previousAttempts + 1,
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

  /** Fan-out for `window/showMessage` / `window/logMessage` severity errors. */
  private handleServerError(languageId: string, message: string): void {
    for (const listener of this.serverErrorListeners) {
      try {
        listener(languageId, message);
      } catch (err) {
        console.error(
          `[code-feedback] serverError listener threw:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
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
