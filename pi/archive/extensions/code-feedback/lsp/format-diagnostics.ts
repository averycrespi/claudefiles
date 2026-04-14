import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Diagnostic,
  type DiagnosticRelatedInformation,
  DiagnosticSeverity,
} from "vscode-languageserver-protocol";

import { MAX_RELATED_PER_DIAG } from "../constants.js";

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
      lines.push(...formatRelatedInfo(d.relatedInformation, cwd, "    "));
    }
  }
  return lines.join("\n").trim();
}

/**
 * Renders `relatedInformation` entries as indented continuation lines under
 * the parent diagnostic. Capped at MAX_RELATED_PER_DIAG with a "... and N
 * more related" tail. Returns an empty array when there's nothing to show.
 */
function formatRelatedInfo(
  related: DiagnosticRelatedInformation[] | undefined,
  cwd: string,
  indent: string,
): string[] {
  if (!related || related.length === 0) return [];
  const shown = related.slice(0, MAX_RELATED_PER_DIAG);
  const lines = shown.map((r) => {
    const path = uriToRelative(r.location.uri, cwd);
    const line = r.location.range.start.line + 1;
    return `${indent}↳ ${path}:${line}: ${r.message}`;
  });
  if (related.length > MAX_RELATED_PER_DIAG) {
    lines.push(
      `${indent}... and ${related.length - MAX_RELATED_PER_DIAG} more related`,
    );
  }
  return lines;
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
  const path = uri.startsWith("file://") ? fileURLToPath(uri) : uri;
  return relative(cwd, path) || path;
}
