import { execFile as execFileCb } from "node:child_process";
import type { ExecFileException } from "node:child_process";
import type { NotifyContext } from "./utils.ts";
import { logFormattingIssue } from "./utils.ts";

export const _execFile = { fn: execFileCb };

function execFile(
  file: string,
  args: string[],
  options: { signal: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    _execFile.fn(file, args, options, (error: ExecFileException | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function formatGoFile(
  filePath: string,
  signal: AbortSignal,
  ctx: NotifyContext,
): Promise<void> {
  try {
    await execFile("gofmt", ["-w", filePath], { signal });
  } catch (error: any) {
    if (error?.name === "AbortError") return;
    if (error?.code === "ENOENT") return;
    logFormattingIssue(
      ctx,
      `gofmt failed for ${filePath}: ${error?.message ?? String(error)}`,
    );
  }
}
