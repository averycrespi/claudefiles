import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  applyExactTextEdits,
  type ExactTextEdit,
} from "../workflow-modes/artifact.ts";

export { applyExactTextEdits, type ExactTextEdit };

export const SPEC_ROOT = ".specs";
export const ARTIFACT_FILENAMES = [
  "brief.md",
  "requirements.md",
  "design.md",
  "tasks.md",
  "runtime.json",
  "events.jsonl",
  "report.md",
] as const;

export type ArtifactFilename = (typeof ARTIFACT_FILENAMES)[number];

const ARTIFACT_SET = new Set<string>(ARTIFACT_FILENAMES);

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function isWithin(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}${sep}`);
}

export function resolveSpecDir(
  cwd: string,
  slug: string,
):
  | { ok: true; absolutePath: string; displayPath: string }
  | { ok: false; error: string } {
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error: "slug must be kebab-case lowercase letters/numbers",
    };
  }
  const specsRoot = resolve(cwd, SPEC_ROOT);
  const absolutePath = resolve(specsRoot, slug);
  if (!isWithin(specsRoot, absolutePath)) {
    return { ok: false, error: "spec path must stay within .specs/" };
  }
  return { ok: true, absolutePath, displayPath: relative(cwd, absolutePath) };
}

export function resolveArtifactPath(
  cwd: string,
  slug: string,
  filename: string,
):
  | {
      ok: true;
      absolutePath: string;
      displayPath: string;
      filename: ArtifactFilename;
    }
  | { ok: false; error: string } {
  if (
    isAbsolute(filename) ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    return { ok: false, error: "artifact filename must be a known basename" };
  }
  if (!ARTIFACT_SET.has(filename)) {
    return { ok: false, error: `unknown artifact filename: ${filename}` };
  }
  const dir = resolveSpecDir(cwd, slug);
  if (!dir.ok) return dir;
  const absolutePath = resolve(dir.absolutePath, filename);
  if (!isWithin(dir.absolutePath, absolutePath)) {
    return {
      ok: false,
      error: "artifact path must stay within spec directory",
    };
  }
  return {
    ok: true,
    absolutePath,
    displayPath: relative(cwd, absolutePath),
    filename: filename as ArtifactFilename,
  };
}

export async function writeArtifact(
  cwd: string,
  slug: string,
  filename: ArtifactFilename,
  content: string,
): Promise<{ ok: true; displayPath: string } | { ok: false; error: string }> {
  const target = resolveArtifactPath(cwd, slug, filename);
  if (!target.ok) return target;
  await mkdir(dirname(target.absolutePath), { recursive: true });
  await writeFile(target.absolutePath, content, "utf8");
  return { ok: true, displayPath: target.displayPath };
}

export async function editArtifact(
  cwd: string,
  slug: string,
  filename: ArtifactFilename,
  edits: ExactTextEdit[],
): Promise<
  | { ok: true; displayPath: string; diff: string; firstChangedLine?: number }
  | { ok: false; error: string }
> {
  const target = resolveArtifactPath(cwd, slug, filename);
  if (!target.ok) return target;
  let original = "";
  try {
    original = await readFile(target.absolutePath, "utf8");
  } catch {
    return {
      ok: false,
      error: `artifact does not exist: ${target.displayPath}`,
    };
  }
  const result = applyExactTextEdits(original, edits);
  if (!result.ok) return result;
  await writeFile(target.absolutePath, result.content, "utf8");
  return {
    ok: true,
    displayPath: target.displayPath,
    diff: result.diff,
    firstChangedLine: result.firstChangedLine,
  };
}

export async function ensureSpecsExcluded(
  cwd: string,
): Promise<
  { ok: true; changed: boolean; path?: string } | { ok: false; error: string }
> {
  const gitDir = resolve(cwd, ".git");
  const excludePath = resolve(gitDir, "info", "exclude");
  try {
    let content = "";
    try {
      content = await readFile(excludePath, "utf8");
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
    const lines = content.split("\n").map((line) => line.trim());
    if (lines.includes(SPEC_ROOT) || lines.includes(`${SPEC_ROOT}/`)) {
      return { ok: true, changed: false, path: relative(cwd, excludePath) };
    }
    await mkdir(dirname(excludePath), { recursive: true });
    const next = `${content}${content && !content.endsWith("\n") ? "\n" : ""}${SPEC_ROOT}/\n`;
    await writeFile(excludePath, next, "utf8");
    return { ok: true, changed: true, path: relative(cwd, excludePath) };
  } catch (error) {
    return {
      ok: false,
      error: `could not update .git/info/exclude: ${String(error)}`,
    };
  }
}
