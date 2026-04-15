import { readFile } from "node:fs/promises";
import { parseJsonReport } from "../lib/parse.ts";
import {
  ReviewerReportSchema,
  type Finding,
  type ReviewerReport,
} from "../lib/schemas.ts";
import type { DispatchOptions, DispatchResult } from "../lib/dispatch.ts";

type Dispatch = (opts: DispatchOptions) => Promise<DispatchResult>;

export type ReviewerName = "plan-completeness" | "integration" | "security";

const REVIEWER_NAMES: readonly ReviewerName[] = [
  "plan-completeness",
  "integration",
  "security",
] as const;

const PROMPT_PATHS: Record<ReviewerName, URL> = {
  "plan-completeness": new URL(
    "../prompts/reviewer-plan-completeness.md",
    import.meta.url,
  ),
  integration: new URL("../prompts/reviewer-integration.md", import.meta.url),
  security: new URL("../prompts/reviewer-security.md", import.meta.url),
};

const promptCache: Partial<Record<ReviewerName, string>> = {};

async function loadPrompt(name: ReviewerName): Promise<string> {
  const cached = promptCache[name];
  if (cached !== undefined) return cached;
  const text = await readFile(PROMPT_PATHS[name], "utf8");
  promptCache[name] = text;
  return text;
}

function fillPrompt(
  template: string,
  diff: string,
  archNotes: string,
  taskList: string,
): string {
  return template
    .split("{DIFF}")
    .join(diff)
    .split("{ARCHITECTURE_NOTES}")
    .join(archNotes)
    .split("{TASK_LIST}")
    .join(taskList);
}

export interface RunReviewersArgs {
  dispatch: Dispatch;
  diff: string;
  archNotes: string;
  taskListSummary: string;
  cwd: string;
}

export interface RunReviewersResult {
  reports: Record<ReviewerName, ReviewerReport>;
  skippedReviewers: string[];
}

/**
 * Dispatches the three reviewer subagents in parallel. Each reviewer gets
 * the diff, architecture notes, and a serialized task-list summary. On
 * dispatch failure or parse failure for any reviewer, its report is
 * recorded as `{ findings: [] }` and its name is added to
 * `skippedReviewers`.
 */
export async function runReviewers(
  args: RunReviewersArgs,
): Promise<RunReviewersResult> {
  const outcomes = await Promise.all(
    REVIEWER_NAMES.map(async (name) => {
      const template = await loadPrompt(name);
      const prompt = fillPrompt(
        template,
        args.diff,
        args.archNotes,
        args.taskListSummary,
      );
      const dispatchResult = await args.dispatch({
        prompt,
        tools: ["read", "ls", "find", "grep"],
        cwd: args.cwd,
        intent: `Review: ${name}`,
      });
      const emptyReport: ReviewerReport = { findings: [] };
      if (!dispatchResult.ok) {
        return { name, report: emptyReport, skipped: true };
      }
      const parsed = parseJsonReport(
        dispatchResult.stdout,
        ReviewerReportSchema,
      );
      if (!parsed.ok) {
        return { name, report: emptyReport, skipped: true };
      }
      return { name, report: parsed.data, skipped: false };
    }),
  );

  const reports = {
    "plan-completeness": { findings: [] },
    integration: { findings: [] },
    security: { findings: [] },
  } as Record<ReviewerName, ReviewerReport>;
  const skippedReviewers: string[] = [];
  for (const o of outcomes) {
    reports[o.name] = o.report;
    if (o.skipped) skippedReviewers.push(o.name);
  }
  return { reports, skippedReviewers };
}

export interface SynthesizedFindings {
  auto: Finding[];
  knownIssues: Finding[];
}

const SEVERITY_RANK: Record<Finding["severity"], number> = {
  suggestion: 0,
  important: 1,
  blocker: 2,
};

/**
 * Pure synthesis: combines per-reviewer findings into auto-fix and
 * known-issue buckets.
 *
 * 1. Drop findings with confidence < 80.
 * 2. Deduplicate: two findings on the same file whose lines are within
 *    3 of each other collapse into one — the one with the highest
 *    severity wins (its file/line/description are kept).
 * 3. Triage: `blocker`/`important` → auto; `suggestion` → knownIssues.
 */
export function synthesizeFindings(
  reportsByReviewer: Record<string, ReviewerReport>,
): SynthesizedFindings {
  // Step 1: collect + confidence filter.
  const all: Finding[] = [];
  for (const name of Object.keys(reportsByReviewer)) {
    const report = reportsByReviewer[name];
    for (const f of report.findings) {
      if (f.confidence < 80) continue;
      all.push(f);
    }
  }

  // Step 2: deduplicate. Greedy clustering by file with ±3 line
  // proximity. Within each cluster, keep the finding with the highest
  // severity (ties: first seen wins — stable).
  const kept: Finding[] = [];
  for (const f of all) {
    let mergedInto = -1;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      if (k.file === f.file && Math.abs(k.line - f.line) <= 3) {
        mergedInto = i;
        break;
      }
    }
    if (mergedInto === -1) {
      kept.push(f);
      continue;
    }
    const existing = kept[mergedInto];
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity]) {
      kept[mergedInto] = f;
    }
    // else drop the new finding.
  }

  // Step 3: triage.
  const auto: Finding[] = [];
  const knownIssues: Finding[] = [];
  for (const f of kept) {
    if (f.severity === "suggestion") knownIssues.push(f);
    else auto.push(f);
  }
  return { auto, knownIssues };
}
