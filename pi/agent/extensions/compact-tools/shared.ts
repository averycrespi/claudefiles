/**
 * Shared helpers for the compact-tools extension.
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * Convert an incoming path argument into a short, cwd-relative display label.
 * Falls back to the absolute path when the target escapes cwd.
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

  if (relativePath === "") {
    return ".";
  }

  return absolutePath;
}

/**
 * Extract the plain-text portion of a tool result, ignoring image content.
 */
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
 * Collapse a possibly multi-line command into a single-line label.
 * Appends a dim ellipsis marker when trailing lines were dropped.
 */
export function singleLineCommand(command: unknown): string {
  if (typeof command !== "string" || command.length === 0) return "";
  const newlineIndex = command.indexOf("\n");
  if (newlineIndex === -1) return command;
  return `${command.slice(0, newlineIndex).trimEnd()} …`;
}
