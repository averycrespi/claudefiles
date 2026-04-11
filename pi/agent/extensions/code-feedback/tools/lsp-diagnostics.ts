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
