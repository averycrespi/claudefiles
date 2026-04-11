import { Type, type Static } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { resolve } from "node:path";

import { EXPLICIT_TOOL_BLOCK_TIMEOUT_MS } from "../timing.js";
import { fileUriFor } from "../lsp/client.js";
import { type FileSync } from "../lsp/file-sync.js";
import { formatExplicitDiagnostics } from "../lsp/format-diagnostics.js";
import { getLanguageIdForFile } from "../lsp/language-map.js";
import { type LspManager } from "../lsp/manager.js";
import { DEFAULT_SERVERS } from "../lsp/servers.js";
import {
  firstLine,
  getRelativeLabel,
  getResultText,
  plural,
} from "./render.js";

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
        // Differentiate "no diagnostics because everything is clean"
        // from "no diagnostics because no server is running" or "no
        // server has seen any files yet". Returning a bare "No
        // diagnostics." in those cases misleads the model into
        // thinking the workspace is healthy.
        const entries = Array.from(manager.getAllStates().entries());
        const hasRunning = entries.some(([, s]) => s.kind === "running");

        if (!hasRunning) {
          // Walk the non-running states for the most informative reason,
          // mirroring the workspaceSymbol branch of lsp_navigation. The
          // state key is `${languageId}:${rootDir}` so we can pull the
          // language id out for installHint lookups.
          let starting = false;
          let brokenError: string | null = null;
          let missingBinary: { command: string; languageId: string } | null =
            null;
          let crashedError: string | null = null;
          for (const [key, serverState] of entries) {
            const languageId = key.split(":", 1)[0];
            switch (serverState.kind) {
              case "starting":
                starting = true;
                break;
              case "broken":
                brokenError ??= serverState.error.message;
                break;
              case "missing-binary":
                missingBinary ??= {
                  command: serverState.command,
                  languageId,
                };
                break;
              case "crashed-too-often":
                crashedError ??= serverState.error.message;
                break;
            }
          }
          let text: string;
          let stateTag: string;
          if (starting) {
            text = "LSP server is still starting up. Try again in a moment.";
            stateTag = "starting";
          } else if (brokenError) {
            text = `LSP server failed to start: ${brokenError}`;
            stateTag = "broken";
          } else if (missingBinary) {
            const installHint =
              DEFAULT_SERVERS[missingBinary.languageId]?.installHint ?? "";
            text =
              `LSP server '${missingBinary.command}' is not installed. ` +
              `${missingBinary.languageId} diagnostics are unavailable this session. ${installHint}`.trim();
            stateTag = "missing-binary";
          } else if (crashedError) {
            text = `LSP server crashed too many times this session and is disabled. Last error: ${crashedError}`;
            stateTag = "crashed-too-often";
          } else {
            const supported = Object.keys(DEFAULT_SERVERS).sort().join(", ");
            text =
              "No LSP servers are running. Workspace-wide diagnostics require at least one running server. " +
              `Edit a file in a supported language (${supported}) or call lsp_diagnostics on a specific file path to start one.`;
            stateTag = "not-started";
          }
          return {
            content: [{ type: "text" as const, text }],
            details: { mode: "workspace", state: stateTag },
          };
        }

        // At least one server is running. If no files have been tracked
        // yet (no writes / edits / explicit queries), there's nothing to
        // report on — say so explicitly instead of implying the workspace
        // is clean.
        const uris = fileSync.getTrackedUris();
        if (uris.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "LSP server is running but no files have been opened yet. " +
                  "Edit or query a specific file (with `lsp_diagnostics <path>` or `lsp_navigation`) first so diagnostics can be collected.",
              },
            ],
            details: { mode: "workspace", state: "no-tracked-files" },
          };
        }

        const collected: Array<{ uri: string; diagnostics: any[] }> = [];
        for (const uri of uris) {
          // Find the running client that owns this URI.
          for (const [, serverState] of manager.getAllStates()) {
            if (serverState.kind !== "running") continue;
            const cached = serverState.client.getCachedDiagnostics(uri);
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
                `LSP server '${state.command}' is not installed. ` +
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
      if (state.kind === "broken") {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `LSP server for ${registryId} failed to start. ` +
                `Last error: ${state.error.message}`,
            },
          ],
          details: { state: "broken" },
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

      // Ensure the file is opened in the LSP server before querying.
      // gopls doesn't need this (auto-indexes the workspace), but
      // tsserver returns "Unexpected resource" for files it has never
      // been introduced to via `didOpen`.
      await fileSync.openForQuery(absPath, registryId);

      const uri = fileUriFor(absPath);
      const diagnostics = await client.getDiagnostics(uri);
      const text = formatExplicitDiagnostics([{ uri, diagnostics }], ctx.cwd);
      return {
        content: [{ type: "text" as const, text }],
        details: { mode: "single", count: diagnostics.length },
      };
    },

    renderCall(args, theme, context) {
      const header = theme.fg("toolTitle", theme.bold("lsp_diagnostics"));
      const target =
        args?.path === "*"
          ? theme.fg("muted", "workspace")
          : theme.fg("accent", getRelativeLabel(context.cwd, args?.path));
      return new Text(`${header} ${target}`, 0, 0);
    },

    renderResult(result, { isPartial }, theme, context) {
      if (isPartial) {
        return new Text(theme.fg("warning", "Querying diagnostics…"), 0, 0);
      }
      const text = getResultText(result);
      if (context.isError) {
        return new Text(
          theme.fg("error", firstLine(text) || "lsp_diagnostics error"),
          0,
          0,
        );
      }
      return new Text(theme.fg("muted", summarizeDiagnostics(text)), 0, 0);
    },
  });
}

/**
 * One-line summary of a `formatExplicitDiagnostics` result. Recognizes
 * the "No diagnostics." sentinel and otherwise counts severity labels
 * in the formatted text so we don't need to plumb counts through
 * `details`.
 */
function summarizeDiagnostics(text: string): string {
  if (!text || text === "No diagnostics.") return "No diagnostics.";
  const counts = { error: 0, warning: 0, info: 0, hint: 0 };
  for (const line of text.split("\n")) {
    // Diagnostic body lines look like "  12:5 error: some message [src]".
    const match = line.match(/^\s+\d+:\d+\s+(error|warning|info|hint):/);
    if (match) {
      counts[match[1] as keyof typeof counts] += 1;
    }
  }
  const parts: string[] = [];
  if (counts.error) parts.push(plural(counts.error, "error"));
  if (counts.warning) parts.push(plural(counts.warning, "warning"));
  if (counts.info) parts.push(plural(counts.info, "info"));
  if (counts.hint) parts.push(plural(counts.hint, "hint"));
  if (parts.length === 0) return firstLine(text);
  return parts.join(", ");
}
