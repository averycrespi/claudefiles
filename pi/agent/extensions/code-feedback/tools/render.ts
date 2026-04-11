/**
 * Shared TUI rendering helpers for the `lsp_diagnostics` and
 * `lsp_navigation` tools. Mirrors the compact-tools extension pattern:
 * execution output (the text the model sees) is unchanged; only the
 * TUI display is compacted so a single tool call doesn't blow out the
 * footer with 40+ lines of symbol results.
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * Convert an incoming path argument into a short, cwd-relative display
 * label. Falls back to the absolute path when the target escapes cwd,
 * or `"file"` when nothing usable was provided (streaming partial args).
 */
export function getRelativeLabel(cwd: string, path: unknown): string {
  if (typeof path !== "string" || path.length === 0) return "file";
  const normalized = path.startsWith("@") ? path.slice(1) : path;
  const absolutePath = resolve(cwd, normalized);
  const relativePath = relative(cwd, absolutePath);
  if (
    relativePath &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  ) {
    return relativePath;
  }
  if (relativePath === "") return ".";
  return absolutePath;
}

/** Extract the plain-text portion of a tool result, ignoring images. */
export function getResultText(result: AgentToolResult<unknown>): string {
  const textContent = result.content.find((c) => c.type === "text");
  return textContent?.type === "text" ? textContent.text : "";
}

/** First non-empty line of `text`, or an empty string. */
export function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "";
}

/**
 * Count the non-empty lines in `text`. Used to derive "N references"
 * / "N symbols" summaries from the formatted tool result text without
 * re-plumbing counts through `details`.
 */
export function countNonEmptyLines(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) {
    if (line.trim().length > 0) n += 1;
  }
  return n;
}

/** English pluralization for compact labels (e.g. "1 reference", "3 references"). */
export function plural(
  count: number,
  singular: string,
  pluralForm?: string,
): string {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${pluralForm ?? singular + "s"}`;
}
