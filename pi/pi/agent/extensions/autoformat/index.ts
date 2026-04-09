/**
 * Autoformat extension for Pi.
 *
 * After a successful built-in `write` or `edit` tool result, formats the
 * touched file automatically:
 *   - Go files -> gofmt
 *   - Files Prettier understands -> prettier
 *
 * If formatting fails or the formatter is unavailable, the original tool result
 * is left unchanged and the error is logged.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { extname, resolve } from "node:path";
import { formatGoFile } from "./gofmt.js";
import { formatWithPrettier } from "./prettier.js";
import {
  getToolPath,
  type NotifyContext,
  logFormattingIssue,
} from "./utils.js";

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

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") {
      return;
    }

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

    try {
      await autoformatFile(resolve(ctx.cwd, path), ctx as NotifyContext);
    } catch (error: any) {
      logFormattingIssue(
        ctx as NotifyContext,
        `Autoformat failed for ${path}: ${error?.message ?? String(error)}`,
      );
    }
  });
}
