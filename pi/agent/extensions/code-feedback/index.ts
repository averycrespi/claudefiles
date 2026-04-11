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
import { registerLspDiagnosticsTool } from "./tools/lsp-diagnostics.js";

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

  registerLspDiagnosticsTool(pi, {
    getManager: () => manager,
    getFileSync: () => fileSync,
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
