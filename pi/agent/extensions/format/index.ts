/**
 * format extension for Pi.
 *
 * After a successful built-in `write` or `edit`, runs gofmt (.go) or
 * prettier (everything else Prettier understands) against the file.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { extname, resolve } from "node:path";

import { formatGoFile } from "./gofmt.ts";
import { formatWithPrettier } from "./prettier.ts";
import {
  getToolPath,
  type NotifyContext,
  logFormattingIssue,
} from "./utils.ts";

async function formatFile(filePath: string, ctx: NotifyContext): Promise<void> {
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
      await formatFile(absPath, notifyCtx);
    } catch (error) {
      logFormattingIssue(
        notifyCtx,
        `Format failed for ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}
