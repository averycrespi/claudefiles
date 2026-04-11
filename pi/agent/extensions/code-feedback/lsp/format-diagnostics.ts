import { relative } from "node:path";
import {
  type Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver-protocol";

import {
  AUTO_INJECT_SEVERITIES,
  MAX_INLINE_ERRORS_PER_FILE,
} from "../constants.js";

/**
 * Formats the auto-inject diagnostic summary appended to write/edit
 * tool_result content. Errors only (per AUTO_INJECT_SEVERITIES). Caps at
 * MAX_INLINE_ERRORS_PER_FILE per file with a "... and N more" tail.
 *
 * Returns `null` if there are no surfaceable diagnostics — caller should
 * not append anything in that case.
 */
export function formatAutoInjectSummary(
  filePath: string,
  cwd: string,
  diagnostics: Diagnostic[],
): string | null {
  const errors = diagnostics.filter(
    (d) => d.severity !== undefined && AUTO_INJECT_SEVERITIES.has(d.severity),
  );
  if (errors.length === 0) return null;

  const relPath = relative(cwd, filePath) || filePath;
  const shown = errors.slice(0, MAX_INLINE_ERRORS_PER_FILE);

  const lines = shown.map((d) => {
    const line = d.range.start.line + 1;
    const col = d.range.start.character + 1;
    const source = d.source ? ` [${d.source}]` : "";
    return `${relPath}:${line}:${col} error: ${d.message}${source}`;
  });

  let header = `⚠ LSP: ${errors.length} error(s) in ${relPath}`;
  if (errors.length > MAX_INLINE_ERRORS_PER_FILE) {
    header += ` (showing first ${MAX_INLINE_ERRORS_PER_FILE})`;
  }
  header += ":";

  let result = `${header}\n${lines.join("\n")}`;
  if (errors.length > MAX_INLINE_ERRORS_PER_FILE) {
    result += `\n... and ${errors.length - MAX_INLINE_ERRORS_PER_FILE} more error(s)`;
  }
  return result;
}

/**
 * Formats diagnostics for the explicit `lsp_diagnostics` tool. Includes
 * ALL severities (not just errors) and uses a wider format with severity
 * labels. Used for both single-file and workspace-wide queries.
 */
export function formatExplicitDiagnostics(
  diagnostics: Array<{ uri: string; diagnostics: Diagnostic[] }>,
  cwd: string,
): string {
  const total = diagnostics.reduce((acc, f) => acc + f.diagnostics.length, 0);
  if (total === 0) return "No diagnostics.";

  const lines: string[] = [];
  for (const file of diagnostics) {
    if (file.diagnostics.length === 0) continue;
    const relPath = uriToRelative(file.uri, cwd);
    lines.push(`\n${relPath} (${file.diagnostics.length}):`);
    for (const d of file.diagnostics) {
      const sev = severityLabel(d.severity);
      const line = d.range.start.line + 1;
      const col = d.range.start.character + 1;
      const source = d.source ? ` [${d.source}]` : "";
      lines.push(`  ${line}:${col} ${sev}: ${d.message}${source}`);
    }
  }
  return lines.join("\n").trim();
}

function severityLabel(severity?: DiagnosticSeverity): string {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return "error";
    case DiagnosticSeverity.Warning:
      return "warning";
    case DiagnosticSeverity.Information:
      return "info";
    case DiagnosticSeverity.Hint:
      return "hint";
    default:
      return "unknown";
  }
}

function uriToRelative(uri: string, cwd: string): string {
  const path = uri.startsWith("file://") ? uri.slice(7) : uri;
  return relative(cwd, path) || path;
}
