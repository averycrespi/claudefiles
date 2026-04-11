import { Type, type Static } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
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
import { type FileSync } from "../lsp/file-sync.js";
import { getLanguageIdForFile } from "../lsp/language-map.js";
import { type LspManager } from "../lsp/manager.js";
import { DEFAULT_SERVERS } from "../lsp/servers.js";
import {
  countNonEmptyLines,
  firstLine,
  getRelativeLabel,
  getResultText,
  plural,
} from "./render.js";

const VALID_OPERATIONS = [
  "definition",
  "references",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
] as const;
type ValidOperation = (typeof VALID_OPERATIONS)[number];

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
  getFileSync: () => FileSync | null;
}

export function registerLspNavigationTool(pi: ExtensionAPI, deps: Deps): void {
  pi.registerTool({
    name: "lsp_navigation",
    label: "LSP Navigation",
    description:
      "Provides LSP-powered code navigation: jump to definition, find references, hover for type info, list document symbols, or search workspace symbols. Use this instead of grep when you need precise semantic results.",
    parameters: params,

    // Accepts common variants (snake_case, plural, abbreviations) so
    // the model doesn't bounce off AJV's cryptic "must be equal to
    // constant" union error. If the operation isn't recognized at all,
    // we throw a message that explicitly lists the valid values — the
    // thrown error surfaces as the tool result (see prepareToolCall
    // in pi-agent-core/agent-loop.js).
    prepareArguments: prepareNavigationArguments,

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
        // Pick the first running client, falling back to the most
        // informative non-running state so the caller gets a real reason
        // ("still starting", "gopls not installed", ...) instead of the
        // generic "edit a file first".
        let runningClient = null;
        let starting = false;
        let brokenError: string | null = null;
        let missingBinary: string | null = null;
        let crashedLanguage: string | null = null;
        for (const [, serverState] of manager.getAllStates()) {
          switch (serverState.kind) {
            case "running":
              runningClient = serverState.client;
              break;
            case "starting":
              starting = true;
              break;
            case "broken":
              brokenError ??= serverState.error.message;
              break;
            case "missing-binary":
              missingBinary ??= serverState.command;
              break;
            case "crashed-too-often":
              crashedLanguage ??= serverState.error.message;
              break;
          }
          if (runningClient) break;
        }
        if (runningClient) {
          const symbols =
            (await runningClient.workspaceSymbol(input.query)) ?? [];
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
        if (starting) {
          return errorResult(
            "LSP server is still starting up. Try again in a moment.",
          );
        }
        if (brokenError) {
          return errorResult(`LSP server failed to start: ${brokenError}`);
        }
        if (missingBinary) {
          return errorResult(`LSP server '${missingBinary}' is not installed.`);
        }
        if (crashedLanguage) {
          return errorResult(
            `LSP server crashed too many times this session and is disabled. Last error: ${crashedLanguage}`,
          );
        }
        return errorResult(
          "No LSP server is currently running. Edit a file in a supported language first.",
        );
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
      if (state.kind === "broken") {
        return errorResult(
          `LSP server for ${registryId} failed to start. Last error: ${state.error.message}`,
        );
      }
      if (!client) {
        return errorResult(
          `LSP server for ${registryId} is still starting up. Try again in a moment.`,
        );
      }

      // Ensure the file is opened in the LSP server before querying.
      // gopls auto-indexes the workspace and doesn't need this, but
      // tsserver returns "Unexpected resource" for files it has never
      // been introduced to via `didOpen`, and "No Project" for
      // workspace-wide requests made before any file has been opened.
      const fileSync = deps.getFileSync();
      if (fileSync) {
        await fileSync.openForQuery(absPath, registryId);
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

    renderCall(args, theme, context) {
      const header = theme.fg("toolTitle", theme.bold("lsp_navigation"));
      const operation = args?.operation
        ? theme.fg("muted", args.operation)
        : "";
      const target = theme.fg("accent", renderCallTarget(args, context.cwd));
      return new Text(
        [header, operation, target].filter(Boolean).join(" "),
        0,
        0,
      );
    },

    renderResult(result, { isPartial }, theme, context) {
      const operation = context.args?.operation;
      if (isPartial) {
        return new Text(
          theme.fg("warning", `Querying ${operation ?? "lsp"}…`),
          0,
          0,
        );
      }
      const text = getResultText(result);
      if (context.isError) {
        return new Text(
          theme.fg("error", firstLine(text) || "lsp_navigation error"),
          0,
          0,
        );
      }
      return new Text(
        theme.fg("muted", summarizeNavigationResult(operation, text)),
        0,
        0,
      );
    },
  });
}

/** Human-readable call label for the header line. */
function renderCallTarget(
  args: Static<typeof params> | undefined,
  cwd: string,
): string {
  if (!args) return "";
  if (args.operation === "workspaceSymbol") {
    return args.query ? `"${args.query}"` : "";
  }
  if (!args.filePath) return "";
  const label = getRelativeLabel(cwd, args.filePath);
  if (
    (args.operation === "definition" ||
      args.operation === "references" ||
      args.operation === "hover") &&
    typeof args.line === "number" &&
    typeof args.character === "number"
  ) {
    return `${label}:${args.line}:${args.character}`;
  }
  return label;
}

/** One-line summary of the result, suitable for the TUI row beneath the call. */
function summarizeNavigationResult(
  operation: string | undefined,
  text: string,
): string {
  if (!text) return "";
  // Empty-result messages from the formatters all start with "No ".
  if (text.startsWith("No ")) return firstLine(text);
  switch (operation) {
    case "definition": {
      const n = countNonEmptyLines(text);
      if (n === 1) return `→ ${text.trim()}`;
      return plural(n, "definition");
    }
    case "references":
      return plural(countNonEmptyLines(text), "reference");
    case "documentSymbol":
    case "workspaceSymbol":
      return plural(countNonEmptyLines(text), "symbol");
    case "hover":
      return firstLine(text);
    default:
      return firstLine(text);
  }
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: {},
  };
}

/**
 * Normalizes common operation-name variants before schema validation:
 * lowercases, strips separators, maps abbreviations and plurals to the
 * canonical spelling. Throws a descriptive error when the operation
 * can't be recognized at all — that error becomes the tool result,
 * which is much more useful than AJV's "must be equal to constant"
 * avalanche.
 */
function prepareNavigationArguments(args: unknown): Static<typeof params> {
  // Bail out quietly for anything that isn't a plain object — let AJV
  // produce its own (reasonable) top-level error in that case.
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return args as Static<typeof params>;
  }
  const input = args as Record<string, unknown>;
  if (typeof input.operation !== "string") {
    return input as unknown as Static<typeof params>;
  }
  const normalized = normalizeOperation(input.operation, input);
  if (!normalized) {
    throw new Error(
      `Unknown operation "${input.operation}" for lsp_navigation. ` +
        `Valid operations: ${VALID_OPERATIONS.join(", ")}. ` +
        `Use 'definition', 'references', or 'hover' with filePath + 1-based line + 1-based character; ` +
        `'documentSymbol' with filePath; or 'workspaceSymbol' with a query string.`,
    );
  }
  if (normalized === input.operation) {
    return input as unknown as Static<typeof params>;
  }
  return { ...input, operation: normalized } as Static<typeof params>;
}

/**
 * Maps a user-supplied operation string to a valid literal, or returns
 * null when nothing matches. The comparison is case-insensitive and
 * ignores `_` / `-` separators, so `document_symbol`, `DocumentSymbols`,
 * and `docsymbol` all resolve to `documentSymbol`. The bare word
 * `symbols` is ambiguous between `documentSymbol` and `workspaceSymbol`,
 * so we disambiguate from the other fields the caller provided.
 */
function normalizeOperation(
  value: string,
  input: Record<string, unknown>,
): ValidOperation | null {
  const key = value.toLowerCase().replace(/[_-]/g, "");
  switch (key) {
    case "definition":
    case "def":
    case "defs":
    case "gotodefinition":
      return "definition";
    case "references":
    case "reference":
    case "refs":
    case "ref":
    case "findreferences":
      return "references";
    case "hover":
    case "hoverinfo":
      return "hover";
    case "documentsymbol":
    case "documentsymbols":
    case "docsymbol":
    case "docsymbols":
      return "documentSymbol";
    case "workspacesymbol":
    case "workspacesymbols":
    case "wssymbol":
    case "wssymbols":
    case "navto":
      return "workspaceSymbol";
    case "symbol":
    case "symbols": {
      // Ambiguous. Disambiguate from other fields: a filePath (and no
      // query) → documentSymbol; a query (and no filePath) →
      // workspaceSymbol; otherwise default to documentSymbol since
      // that's the more common ask when the model is inspecting code.
      const hasFilePath =
        typeof input.filePath === "string" && input.filePath.length > 0;
      const hasQuery =
        typeof input.query === "string" && input.query.length > 0;
      if (hasQuery && !hasFilePath) return "workspaceSymbol";
      return "documentSymbol";
    }
    default:
      return null;
  }
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
