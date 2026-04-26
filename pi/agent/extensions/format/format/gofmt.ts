import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { NotifyContext } from "./utils.ts";
import { logFormattingIssue } from "./utils.ts";

const execFile = promisify(execFileCb);

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
