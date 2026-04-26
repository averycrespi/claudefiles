import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";

const exec = promisify(execFile);

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function requireFile(
  path: string,
): Promise<Result<{ path: string }>> {
  try {
    const st = await stat(path);
    if (!st.isFile())
      return { ok: false, error: `not a regular file: ${path}` };
    return { ok: true, data: { path } };
  } catch (e) {
    return {
      ok: false,
      error: `cannot read file: ${path} (${(e as Error).message})`,
    };
  }
}

export async function requireCleanTree(
  cwd: string,
): Promise<Result<Record<string, never>>> {
  try {
    const { stdout } = await exec("git", ["status", "--porcelain"], { cwd });
    if (stdout.trim().length > 0) {
      return {
        ok: false,
        error: "working tree is not clean (uncommitted changes)",
      };
    }
    return { ok: true, data: {} };
  } catch (e) {
    return { ok: false, error: `git status failed: ${(e as Error).message}` };
  }
}

export async function captureHead(cwd: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}
