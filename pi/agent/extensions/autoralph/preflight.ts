import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type PreflightResult =
  | { ok: true; baseSha: string; designText: string }
  | { ok: false; reason: string };

/**
 * Pre-flight checks for the /autoralph command.
 *
 * Fails fast on:
 *   1. missing or non-regular design file
 *   2. empty design file
 *   3. dirty working tree (git status --porcelain non-empty)
 *
 * On success, returns the captured base SHA (git rev-parse HEAD) and
 * the raw design document text. All git commands run with cwd as the
 * working directory (no shell interpolation).
 */
export async function preflight(args: {
  designPath: string;
  cwd: string;
}): Promise<PreflightResult> {
  const { designPath, cwd } = args;

  // 1. Design file must exist and be a regular file.
  let st;
  try {
    st = await stat(designPath);
  } catch {
    return { ok: false, reason: `design file not found: ${designPath}` };
  }
  if (!st.isFile()) {
    return {
      ok: false,
      reason: `design file is not a regular file: ${designPath}`,
    };
  }

  // 2. Read the file; reject if empty.
  const designText = await readFile(designPath, "utf8");
  if (designText.trim().length === 0) {
    return { ok: false, reason: "design file is empty" };
  }

  // 3. Working tree must be clean.
  let porcelain: string;
  try {
    const { stdout } = await execFileP("git", ["status", "--porcelain"], {
      cwd,
    });
    porcelain = stdout;
  } catch (e) {
    return {
      ok: false,
      reason: `failed to run git status: ${(e as Error).message}`,
    };
  }
  if (porcelain.trim().length > 0) {
    return {
      ok: false,
      reason:
        "working tree is dirty; commit or stash changes before /autoralph",
    };
  }

  // 4. Capture base SHA.
  let baseSha: string;
  try {
    const { stdout } = await execFileP("git", ["rev-parse", "HEAD"], { cwd });
    baseSha = stdout.trim();
  } catch (e) {
    return {
      ok: false,
      reason: `failed to resolve HEAD: ${(e as Error).message}`,
    };
  }

  return { ok: true, baseSha, designText };
}
