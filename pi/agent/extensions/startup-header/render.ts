import { basename } from "node:path";
import { truncateToWidth } from "@mariozechner/pi-tui";

export type HeaderTheme = {
  fg(color: string, text: string): string;
  bold(text: string): string;
};

export type HeaderCommit = {
  hash: string;
  subject: string;
};

export type HeaderState = {
  piVersion: string;
  cwd: string;
  repoName?: string;
  branch?: string;
  commits: HeaderCommit[];
};

function fallbackRepoName(cwd: string): string {
  return basename(cwd) || cwd || "repo";
}

function joinMetadata(segments: string[], theme: HeaderTheme): string {
  return segments.join(theme.fg("dim", " · "));
}

export function renderHeader(
  state: HeaderState,
  width: number,
  theme: HeaderTheme,
): string[] {
  if (width <= 0) return [];

  const wordmark = theme.fg("accent", theme.bold("π›"));
  const repoName = state.repoName ?? fallbackRepoName(state.cwd);
  const metadata = joinMetadata(
    [`pi v${state.piVersion}`, repoName, state.branch].filter(
      (segment): segment is string => Boolean(segment),
    ),
    theme,
  );

  const lines = [`${wordmark} ${metadata}`];
  for (const commit of state.commits.slice(0, 3)) {
    const hash = theme.fg("muted", commit.hash);
    lines.push(`   ${hash} ${commit.subject}`);
  }

  return lines.map((line) => truncateToWidth(line, width));
}
