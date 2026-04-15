/**
 * code-feedback extension for Pi.
 *
 * After a successful built-in `write` or `edit` tool result:
 *   1. Autoformat the file (gofmt or prettier — same as the previous
 *      `autoformat` extension this replaces).
 *   2. If a Go or TypeScript/JavaScript file, sync the post-format content
 *      to the language server (lazy-start the server if needed) so the
 *      server is warm when the model later polls via `lsp_diagnostics`.
 *
 * Diagnostics are surfaced only through the explicit `lsp_diagnostics`
 * and `lsp_navigation` tools — nothing is auto-injected into tool
 * results. See DESIGN.md for the rationale.
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
import { configureLogging } from "./log.js";
import { FileSync } from "./lsp/file-sync.js";
import { getLanguageIdForFile } from "./lsp/language-map.js";
import { LspManager, type ServerState } from "./lsp/manager.js";
import { DEFAULT_SERVERS } from "./lsp/servers.js";
import { registerLspDiagnosticsTool } from "./tools/lsp-diagnostics.js";
import { registerLspNavigationTool } from "./tools/lsp-navigation.js";

const state: {
  manager: LspManager | null;
  fileSync: FileSync | null;
  unsubscribeStateChange: (() => void) | null;
  unsubscribeServerError: (() => void) | null;
} = {
  manager: null,
  fileSync: null,
  unsubscribeStateChange: null,
  unsubscribeServerError: null,
};

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
 * Warms the LSP for a file after a successful write/edit: triggers lazy
 * server start and sends the post-format content via `didOpen` /
 * `didChange`. Does not request or return diagnostics — the model pulls
 * them on demand through `lsp_diagnostics`. Keeping the server warm here
 * means those polls don't pay a cold-start cost on files the model just
 * touched.
 */
async function warmLspForFile(absPath: string): Promise<void> {
  if (!state.manager || !state.fileSync) return;

  const registryId = getLanguageIdForFile(absPath);
  if (!registryId || !DEFAULT_SERVERS[registryId]) return;

  try {
    const stats = await stat(absPath);
    if (stats.size > LSP_MAX_FILE_BYTES) return;
  } catch {
    return;
  }

  const client = state.manager.getRunningClient(absPath);
  if (!client) return;

  let content: string;
  try {
    content = await readFile(absPath, "utf-8");
  } catch {
    return;
  }

  state.fileSync.syncWrite(absPath, content, registryId);
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
    // Route diagnostic logging to a file in TUI mode so stderr writes
    // don't corrupt the terminal display. Safe fallthrough to console
    // in non-interactive modes.
    configureLogging(ctx.hasUI);

    state.manager = new LspManager();
    state.fileSync = new FileSync(state.manager);

    // One-time TUI notifications on the first transition into bad states.
    state.unsubscribeStateChange = state.manager.onStateChange(
      (languageId, serverState) => {
        if (!ctx.hasUI) return;
        if (serverState.kind === "missing-binary") {
          if (state.manager?.shouldNotifyMissingBinary(languageId)) {
            const config = DEFAULT_SERVERS[languageId];
            ctx.ui.notify(
              `[code-feedback] LSP server '${serverState.command}' is not installed. ` +
                `${languageId} diagnostics disabled for this session. ` +
                (config?.installHint ?? ""),
              "warning",
            );
          }
        } else if (serverState.kind === "crashed-too-often") {
          if (state.manager?.shouldNotifyCrashedTooOften(languageId)) {
            ctx.ui.notify(
              `[code-feedback] LSP server for ${languageId} crashed too many ` +
                `times this session and has been disabled. Last error: ${serverState.error.message}`,
              "error",
            );
          }
        }
      },
    );

    // Forward severity-Error messages from `window/showMessage` and
    // `window/logMessage` to the UI, deduped per (language, message) so
    // a chatty server doesn't spam notifications.
    state.unsubscribeServerError = state.manager.onServerError(
      (languageId, message) => {
        if (!ctx.hasUI) return;
        if (!state.manager?.shouldNotifyServerError(languageId, message)) {
          return;
        }
        ctx.ui.notify(
          `[code-feedback] ${languageId} LSP reported: ${message}`,
          "error",
        );
      },
    );
  });

  registerLspDiagnosticsTool(pi, {
    getManager: () => state.manager,
    getFileSync: () => state.fileSync,
  });

  registerLspNavigationTool(pi, {
    getManager: () => state.manager,
    getFileSync: () => state.fileSync,
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

    const notifyCtx: NotifyContext = {
      cwd: ctx.cwd,
      hasUI: ctx.hasUI,
      ui: ctx.ui,
    };

    // Step 1: autoformat
    try {
      await autoformatFile(absPath, notifyCtx);
    } catch (error) {
      logFormattingIssue(
        notifyCtx,
        `Autoformat failed for ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Step 2: warm the LSP with the post-format content so a later
    // `lsp_diagnostics` call doesn't pay a cold-start cost.
    await warmLspForFile(absPath);
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    if (!state.manager || !ctx.hasUI) return;
    const status = buildStatusLine(state.manager.getAllStates());
    if (status) ctx.ui.setStatus("code-feedback", status);
  });

  pi.on("session_shutdown", async () => {
    state.unsubscribeStateChange?.();
    state.unsubscribeStateChange = null;
    state.unsubscribeServerError?.();
    state.unsubscribeServerError = null;
    if (state.manager) {
      await state.manager.shutdownAll();
      state.manager = null;
      state.fileSync = null;
    }
  });
}
