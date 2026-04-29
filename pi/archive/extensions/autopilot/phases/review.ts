import { readFile } from "node:fs/promises";
import {
  ReviewerReportSchema,
  type Finding,
  type ReviewerReport,
} from "../lib/schemas.ts";
import type { Subagent } from "../../_workflow-core/lib/subagent.ts";

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
  subagent: Subagent;
  diff: string;
  archNotes: string;
  taskListSummary: string;
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
  const templates = await Promise.all(
    REVIEWER_NAMES.map((name) => loadPrompt(name)),
  );

  const specs = REVIEWER_NAMES.map((name, i) => ({
    intent: `Review: ${name}`,
    prompt: fillPrompt(
      templates[i],
      args.diff,
      args.archNotes,
      args.taskListSummary,
    ),
    schema: ReviewerReportSchema,
    tools: ["read", "ls", "find", "grep"] as const,
    retry: "none" as const,
  }));

  const results = await args.subagent.parallel(specs);

  const reports = {
    "plan-completeness": { findings: [] },
    integration: { findings: [] },
    security: { findings: [] },
  } as Record<ReviewerName, ReviewerReport>;
  const skippedReviewers: string[] = [];

  for (let i = 0; i < REVIEWER_NAMES.length; i++) {
    const name = REVIEWER_NAMES[i];
    const r = results[i];
    if (!r.ok) {
      skippedReviewers.push(name);
    } else {
      reports[name] = r.data;
    }
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
