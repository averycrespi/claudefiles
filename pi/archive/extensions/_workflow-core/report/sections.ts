import { formatLabelValueRow } from "./rows.ts";

export function formatSection(
  title: string,
  indentedLines: string[],
): string[] {
  const out: string[] = [`${title}:`];
  for (const line of indentedLines) out.push(`  ${line}`);
  return out;
}

export interface GitInfoBlockOpts {
  branch: string;
  commitsAhead: number;
  baseBranch?: string;
}

export function formatGitInfoBlock(opts: GitInfoBlockOpts): string[] {
  const base = opts.baseBranch ?? "main";
  const noun = opts.commitsAhead === 1 ? "commit" : "commits";
  return [
    formatLabelValueRow(
      "Branch",
      `${opts.branch}  (${opts.commitsAhead} ${noun} ahead of ${base})`,
    ),
  ];
}

export function formatKnownIssues(issues: string[]): string[] {
  if (issues.length === 0) return [];
  const out = ["Known issues:"];
  for (const i of issues) out.push(`  └ ${i}`);
  return out;
}
