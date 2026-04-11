import { execFile as execFileCb } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { NotifyContext } from "./utils.js";
import { logFormattingIssue } from "./utils.js";

const execFile = promisify(execFileCb);

function prettierBinaryCandidates(cwd: string): string[] {
  return [resolve(cwd, "node_modules/.bin/prettier"), "prettier"];
}

export async function formatWithPrettier(
  filePath: string,
  signal: AbortSignal,
  ctx: NotifyContext,
): Promise<void> {
  const bins = prettierBinaryCandidates(ctx.cwd);
  let lastError: unknown;

  for (const bin of bins) {
    try {
      await execFile(bin, ["--write", "--ignore-unknown", filePath], {
        signal,
      });
      return;
    } catch (error: any) {
      lastError = error;
      if (error?.name === "AbortError") return;
      if (error?.code === "ENOENT") continue;
      break;
    }
  }

  const error = lastError as any;
  if (error?.code === "ENOENT") return;
  logFormattingIssue(
    ctx,
    `Prettier failed for ${filePath}: ${error?.message ?? String(error)}`,
  );
}
