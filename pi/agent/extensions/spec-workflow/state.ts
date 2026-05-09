import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { resolveArtifactPath, resolveSpecDir } from "./artifacts.ts";
import { appendSpecEvent, type SpecEvent } from "./events.ts";
import { validateSpecRuntime } from "./schema.ts";
import type { SpecRuntime } from "./types.ts";

export const STATE_ENTRY_TYPE = "spec-workflow-state";

export type ActiveSpecState = {
  slug?: string;
  phase?: string;
  runtimePath?: string;
};

export function parsePersistedSpecState(
  value: unknown,
): ActiveSpecState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.slug === "string" ? { slug: record.slug } : {}),
    ...(typeof record.phase === "string" ? { phase: record.phase } : {}),
    ...(typeof record.runtimePath === "string"
      ? { runtimePath: record.runtimePath }
      : {}),
  };
}

export function restoreActiveSpecFromBranch(
  branch: Iterable<any>,
): ActiveSpecState | undefined {
  let restored: ActiveSpecState | undefined;
  for (const entry of branch) {
    if (entry?.type === "custom" && entry.customType === STATE_ENTRY_TYPE) {
      restored = parsePersistedSpecState(entry.data) ?? restored;
    }
  }
  return restored;
}

export function runtimePathFor(
  cwd: string,
  slug: string,
):
  | { ok: true; absolutePath: string; displayPath: string }
  | { ok: false; error: string } {
  return resolveArtifactPath(cwd, slug, "runtime.json");
}

export function eventsPathFor(
  cwd: string,
  slug: string,
):
  | { ok: true; absolutePath: string; displayPath: string }
  | { ok: false; error: string } {
  return resolveArtifactPath(cwd, slug, "events.jsonl");
}

export async function readRuntime(
  cwd: string,
  slug: string,
): Promise<
  | { ok: true; runtime: SpecRuntime; path: string }
  | { ok: false; error: string }
> {
  const path = runtimePathFor(cwd, slug);
  if (!path.ok) return path;
  try {
    const parsed = JSON.parse(await readFile(path.absolutePath, "utf8"));
    const validation = validateSpecRuntime(parsed);
    if (!validation.ok)
      return { ok: false, error: validation.errors.join("\n") };
    return { ok: true, runtime: validation.runtime, path: path.displayPath };
  } catch (error: any) {
    if (error?.code === "ENOENT")
      return { ok: false, error: `runtime not found: ${path.displayPath}` };
    return { ok: false, error: `could not read runtime: ${String(error)}` };
  }
}

export async function writeRuntime(
  cwd: string,
  runtime: SpecRuntime,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const path = runtimePathFor(cwd, runtime.slug);
  if (!path.ok) return path;
  await withFileMutationQueue(path.absolutePath, async () => {
    await mkdir(dirname(path.absolutePath), { recursive: true });
    await writeFile(
      path.absolutePath,
      `${JSON.stringify(runtime, null, 2)}\n`,
      "utf8",
    );
  });
  return { ok: true, path: path.displayPath };
}

export async function updateRuntimeWithEvent(
  cwd: string,
  slug: string,
  updater: (runtime: SpecRuntime) => SpecRuntime,
  event: SpecEvent,
): Promise<
  | { ok: true; runtime: SpecRuntime; runtimePath: string; eventsPath: string }
  | { ok: false; error: string }
> {
  const runtimePath = runtimePathFor(cwd, slug);
  if (!runtimePath.ok) return runtimePath;
  const eventsPath = eventsPathFor(cwd, slug);
  if (!eventsPath.ok) return eventsPath;

  return withFileMutationQueue(runtimePath.absolutePath, async () => {
    const current = await readRuntime(cwd, slug);
    if (!current.ok) return current;
    const next = updater(current.runtime);
    const validation = validateSpecRuntime(next);
    if (!validation.ok)
      return { ok: false as const, error: validation.errors.join("\n") };
    await mkdir(dirname(runtimePath.absolutePath), { recursive: true });
    await writeFile(
      runtimePath.absolutePath,
      `${JSON.stringify(validation.runtime, null, 2)}\n`,
      "utf8",
    );
    await appendSpecEvent(eventsPath.absolutePath, event);
    return {
      ok: true as const,
      runtime: validation.runtime,
      runtimePath: runtimePath.displayPath,
      eventsPath: eventsPath.displayPath,
    };
  });
}

export function activeSpecSummary(
  cwd: string,
  slug: string,
  phase: string,
): ActiveSpecState | undefined {
  const dir = resolveSpecDir(cwd, slug);
  if (!dir.ok) return undefined;
  return {
    slug,
    phase,
    runtimePath: `${dir.displayPath}/runtime.json`,
  };
}
