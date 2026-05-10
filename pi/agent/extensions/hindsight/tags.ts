import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type {
  HindsightKind,
  HindsightScope,
  HindsightSource,
} from "./config.ts";

export type TagOptions = {
  cwd: string;
  scope: HindsightScope;
  source: HindsightSource;
  kind?: HindsightKind;
  defaultTags?: string[];
  tags?: string[];
};

export type QueryTagOptions = {
  cwd: string;
  scope: HindsightScope;
  defaultTags?: string[];
  tags?: string[];
};

export function normalizeTag(value: string): string | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-:_]+|[-:_]+$/g, "");
  return normalized || undefined;
}

export function buildTags(options: TagOptions): string[] {
  return normalizeTags([
    `scope:${options.scope}`,
    options.scope === "repo"
      ? `repo:${deriveRepoName(options.cwd)}`
      : undefined,
    `source:${options.source}`,
    options.kind ? `kind:${options.kind}` : undefined,
    ...(options.defaultTags ?? []),
    ...(options.tags ?? []),
  ]);
}

export function buildQueryTags(options: QueryTagOptions): string[] {
  return normalizeTags([
    `scope:${options.scope}`,
    options.scope === "repo"
      ? `repo:${deriveRepoName(options.cwd)}`
      : undefined,
    ...(options.defaultTags ?? []),
    ...(options.tags ?? []),
  ]);
}

function normalizeTags(tags: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      tags.flatMap((tag) => {
        if (!tag) return [];
        const normalized = normalizeTag(tag);
        return normalized ? [normalized] : [];
      }),
    ),
  );
}

export function buildMetadata(options: {
  cwd: string;
  scope: HindsightScope;
  source: HindsightSource;
  kind?: HindsightKind;
  metadata?: Record<string, string>;
}): Record<string, string> {
  return {
    ...(options.metadata ?? {}),
    hindsight_scope: options.scope,
    hindsight_source: options.source,
    ...(options.kind ? { hindsight_kind: options.kind } : {}),
    ...(options.scope === "repo"
      ? { hindsight_repo: deriveRepoName(options.cwd) }
      : {}),
  };
}

export function deriveRepoName(cwd: string): string {
  const start = resolve(cwd);
  let current = start;
  while (true) {
    const dotGit = join(current, ".git");
    if (existsSync(dotGit)) {
      const name = repoNameFromGitPath(dotGit, current);
      if (name) return name;
    }
    const parent = dirname(current);
    if (parent === current) return basename(start);
    current = parent;
  }
}

function repoNameFromGitPath(
  dotGit: string,
  worktreeRoot: string,
): string | undefined {
  try {
    if (!existsSync(dotGit)) return undefined;
    const stat = readFileSync(dotGit, "utf8");
    const match = stat.match(/^gitdir:\s*(.+)$/m);
    if (!match) return basename(worktreeRoot);
    const gitdir = resolveGitPath(match[1] ?? "", worktreeRoot);
    const commonDirPath = join(gitdir, "commondir");
    if (!existsSync(commonDirPath)) return basename(dirname(gitdir));
    const commonDir = readFileSync(commonDirPath, "utf8").trim();
    const resolvedCommon = resolveGitPath(commonDir, gitdir);
    return basename(resolvedCommon) === ".git"
      ? basename(dirname(resolvedCommon))
      : basename(dirname(gitdir));
  } catch {
    return basename(worktreeRoot);
  }
}

function resolveGitPath(path: string, base: string): string {
  return isAbsolute(path) ? path : resolve(base, path);
}
