import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { LSP_MAX_FILE_BYTES, MAX_TRACKED_DOCUMENTS } from "../constants.js";
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
 * Documents are opened in three situations only:
 *   1. A successful `write` or `edit` tool result — handled by the
 *      auto-inject path in `index.ts` via `syncWrite`.
 *   2. An explicit `lsp_diagnostics` call on a single file — via
 *      `openForQuery` below.
 *   3. An explicit `lsp_navigation` call on a file — same.
 *
 * Plain `read` tool calls and bash commands do NOT open documents.
 * See DESIGN.md ("When files get opened") for the rationale.
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
    const resolved = this.manager.lookupRunning(absPath);
    if (!resolved) return null;

    const { client, rootDir } = resolved;
    const uri = fileUriFor(resolve(absPath));
    const lspLanguageId = getLspLanguageId(absPath, registryId);
    const serverKey = `${registryId}:${rootDir}`;

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

  /**
   * Ensures `absPath` has been sent to its LSP server (via `didOpen` or
   * `didChange`) so that explicit query tools — `lsp_diagnostics` and
   * `lsp_navigation` — can operate on it. The original "reads don't
   * open documents" rule is preserved for the auto-inject path; this
   * method only runs when the model has asked for semantic info by
   * name, which we treat as permission to open.
   *
   * Silently no-ops if the file is over `LSP_MAX_FILE_BYTES`, can't be
   * stat'd, or can't be read — the caller's LSP request will then
   * either succeed (if the file was already open from a prior edit)
   * or fail with the LSP's own error.
   */
  async openForQuery(absPath: string, registryId: string): Promise<void> {
    try {
      const stats = await stat(absPath);
      if (stats.size > LSP_MAX_FILE_BYTES) return;
      const content = await readFile(absPath, "utf-8");
      this.syncWrite(absPath, content, registryId);
    } catch {
      // Best-effort — swallowed so explicit queries still get a chance
      // to run against whatever state the server already has.
    }
  }
}
