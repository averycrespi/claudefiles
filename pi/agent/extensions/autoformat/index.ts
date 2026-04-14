/**
 * autoformat extension for Pi.
 *
 * After a successful built-in `write` or `edit` tool result, runs a
 * formatter against the file:
 *   - `.go` files → `gofmt -w`
 *   - everything Prettier understands → `prettier --write --ignore-unknown`
 *
 * Extracted from `code-feedback` after that extension was archived; the
 * formatting half was kept, the LSP half was dropped.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { extname, resolve } from "node:path";

import { formatGoFile } from "./format/gofmt.js";
import { formatWithPrettier } from "./format/prettier.js";
import {
  getToolPath,
  type NotifyContext,
  logFormattingIssue,
} from "./format/utils.js";

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
    const notifyCtx: NotifyContext = {
      cwd: ctx.cwd,
      hasUI: ctx.hasUI,
      ui: ctx.ui,
    };

    try {
      await autoformatFile(absPath, notifyCtx);
    } catch (error) {
      logFormattingIssue(
        notifyCtx,
        `Autoformat failed for ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}
