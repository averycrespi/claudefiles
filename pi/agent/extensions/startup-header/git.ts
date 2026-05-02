import { basename } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { HeaderCommit } from "./render.ts";

export type GitMetadata = {
  repoName?: string;
  branch?: string;
  commits: HeaderCommit[];
};

type ExecResult = {
  stdout?: string;
  stderr?: string;
  code?: number;
  killed?: boolean;
};

export function parseCommitLog(output: string): HeaderCommit[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S+)\s+(.*)$/);
      if (!match) return { hash: line, subject: "" };
      return { hash: match[1]!, subject: match[2]!.trim() };
    })
    .slice(0, 3);
}

function succeeded(result: ExecResult): boolean {
  return !result.killed && (result.code === undefined || result.code === 0);
}

function firstLine(result: ExecResult): string | undefined {
  if (!succeeded(result)) return undefined;
  const line = result.stdout?.split(/\r?\n/).find((value) => value.trim());
  return line?.trim();
}

export async function loadGitMetadata(
  pi: ExtensionAPI,
  cwd: string,
): Promise<GitMetadata> {
  const metadata: GitMetadata = { commits: [] };

  try {
    const root = firstLine(
      (await pi.exec("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        timeout: 2000,
      } as any)) as ExecResult,
    );
    if (root) metadata.repoName = basename(root);

    const branch = firstLine(
      (await pi.exec("git", ["branch", "--show-current"], {
        cwd,
        timeout: 2000,
      } as any)) as ExecResult,
    );
    if (branch) metadata.branch = branch;

    const log = (await pi.exec(
      "git",
      ["log", "-n", "3", "--pretty=format:%h %s"],
      { cwd, timeout: 2000 } as any,
    )) as ExecResult;
    if (succeeded(log) && log.stdout) {
      metadata.commits = parseCommitLog(log.stdout);
    }
  } catch {
    return { commits: [] };
  }

  return metadata;
}
