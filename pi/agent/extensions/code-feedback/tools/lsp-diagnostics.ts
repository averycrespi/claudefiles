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
  clearPartialTimer,
  firstLine,
  getRelativeLabel,
  getResultText,
  partialElapsed,
  plural,
} from "../../_shared/render.js";

const params = Type.Object({
  path: Type.String({
    description: "File path relative to the working directory.",
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
      "Returns LSP diagnostics (errors, warnings, info, hints) for a single file. Useful for checking a file you want to investigate without editing it, or for getting non-error severities the auto-inject feedback leaves out. For whole-project checks, run the project's own compiler via bash (e.g. `tsc --noEmit`, `go build ./...`, `go vet ./...`) — faster and more complete than anything the LSP can offer at workspace scope.",
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
      const target = theme.fg(
        "accent",
        getRelativeLabel(context.cwd, args?.path),
      );
      return new Text(`${header} ${target}`, 0, 0);
    },

    renderResult(result, { isPartial }, theme, context) {
      if (isPartial) {
        return new Text(
          theme.fg(
            "warning",
            `Querying diagnostics...${partialElapsed(context)}`,
          ),
          0,
          0,
        );
      }
      clearPartialTimer(context);
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
