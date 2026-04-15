import { readFile } from "node:fs/promises";
import { parseJsonReport } from "../lib/parse.ts";
import {
  FixerReportSchema,
  type Finding,
  type ReviewerReport,
  type ValidationReport,
} from "../lib/schemas.ts";
import type { DispatchOptions, DispatchResult } from "../lib/dispatch.ts";
import { runValidation } from "./validate.ts";
import {
  runReviewers,
  synthesizeFindings,
  type ReviewerName,
} from "./review.ts";

type Dispatch = (opts: DispatchOptions) => Promise<DispatchResult>;

const FIXER_REVIEW_PROMPT_PATH = new URL(
  "../prompts/fixer-review.md",
  import.meta.url,
);

let cachedFixerReviewPrompt: string | null = null;
async function loadFixerReviewPrompt(): Promise<string> {
  if (cachedFixerReviewPrompt === null) {
    cachedFixerReviewPrompt = await readFile(FIXER_REVIEW_PROMPT_PATH, "utf8");
  }
  return cachedFixerReviewPrompt;
}

export interface RunVerifyArgs {
  dispatch: Dispatch;
  /** Resolves the full diff since the pipeline's base SHA. */
  getDiff: () => Promise<string>;
  archNotes: string;
  taskListSummary: string;
  cwd: string;
  /** Max fixer-review rounds. Default 2. */
  maxFixRounds?: number;
  /** Sub-phase label callback for the status widget. */
  onPhase?: (label: string) => void;
}

export interface RunVerifyResult {
  validationReport: ValidationReport | null;
  reviewerReports: Record<ReviewerName, ReviewerReport>;
  /** Descriptions fixed across all successful fixer rounds. */
  fixed: string[];
  /**
   * Mix of validation-level string summaries and leftover Finding
   * objects (from reviewers) that the fix loop could not resolve.
   */
  knownIssues: Array<string | Finding>;
  skippedReviewers: string[];
}

/**
 * Formats a set of findings for injection into the fixer-review prompt.
 * Numbered list, one per line, with file:line, severity, and description.
 */
function formatFindings(findings: Finding[]): string {
  return findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.severity}] ${f.file}:${f.line} — ${f.description}`,
    )
    .join("\n");
}

/**
 * Stable identity for a finding used to detect "is this the same
 * finding as before?" across reviewer rounds. File + line + first 80
 * chars of description. Severity intentionally excluded — a finding
 * whose severity changes is still the same issue.
 */
function findingKey(f: Finding): string {
  return `${f.file}:${f.line}:${f.description.slice(0, 80)}`;
}

/**
 * Stable identity for a validation knownIssue string. runValidation
 * produces strings like `test failed (bun test): <first line>` — we
 * use the whole string; matching strings are "the same failure".
 */
function validationKey(s: string): string {
  return s;
}

/**
 * Verify phase: validation → reviewers → (bounded fixer loop) → results.
 *
 * Orchestration (full 2-round loop):
 *
 *   1. runValidation → collect its knownIssues (strings) as a baseline.
 *   2. runReviewers (on current diff) → synthesize.
 *      - synthesize.knownIssues (suggestions) flow straight to output.
 *      - synthesize.auto (blocker+important) feeds the fix loop.
 *   3. If no auto findings → return early.
 *   4. Fix loop up to maxFixRounds (default 2):
 *        a. Dispatch fixer-review subagent with current auto findings.
 *           On parse failure of fixer output, record an "unproductive
 *           fixer round" known issue and break.
 *        b. Accumulate fixer.fixed descriptions.
 *        c. Re-run validation. Any NEW failure (signature not in the
 *           initial validation baseline) → added as string knownIssue;
 *           loop terminates (no further fix rounds).
 *        d. Refresh diff, re-run reviewers, re-synthesize. Drop auto
 *           findings whose key no longer appears. Newly appeared
 *           findings are NOT added (the loop works only on the
 *           originally flagged set). If auto is empty, done.
 *   5. After loop, remaining auto findings → knownIssues.
 *
 * Returns aggregated results for the final-report formatter.
 */
export async function runVerify(args: RunVerifyArgs): Promise<RunVerifyResult> {
  const maxFixRounds = args.maxFixRounds ?? 2;

  const knownIssues: Array<string | Finding> = [];
  const fixed: string[] = [];

  // --- Step 1: initial validation ----------------------------------
  args.onPhase?.("Verifying · validation");
  const initialValidation = await runValidation({
    dispatch: args.dispatch,
    cwd: args.cwd,
  });
  let validationReport: ValidationReport | null = initialValidation.report;
  const initialValidationKeys = new Set<string>();
  for (const s of initialValidation.knownIssues) {
    initialValidationKeys.add(validationKey(s));
    knownIssues.push(s);
  }

  // --- Step 2: initial reviewers + synthesize ----------------------
  args.onPhase?.("Verifying · reviewers");
  const initialDiff = await args.getDiff();
  const { reports: initialReports, skippedReviewers } = await runReviewers({
    dispatch: args.dispatch,
    diff: initialDiff,
    archNotes: args.archNotes,
    taskListSummary: args.taskListSummary,
    cwd: args.cwd,
  });
  let reviewerReports: Record<ReviewerName, ReviewerReport> = initialReports;
  const initialSynth = synthesizeFindings(initialReports);
  for (const s of initialSynth.knownIssues) {
    knownIssues.push(s);
  }

  // --- Step 3: early exit when no auto-fixable findings ------------
  let auto: Finding[] = initialSynth.auto;
  if (auto.length === 0) {
    return {
      validationReport,
      reviewerReports,
      fixed,
      knownIssues,
      skippedReviewers,
    };
  }

  // --- Step 4: bounded fix loop ------------------------------------
  const fixerTemplate = await loadFixerReviewPrompt();

  for (let round = 0; round < maxFixRounds; round++) {
    // 4a. Dispatch fixer-review.
    args.onPhase?.(
      `Verifying · auto-fix round ${round + 1} (${auto.length} finding${auto.length === 1 ? "" : "s"})`,
    );
    const fixerPrompt = fixerTemplate.replace(
      "{FINDINGS}",
      formatFindings(auto),
    );
    const fixerDispatch = await args.dispatch({
      prompt: fixerPrompt,
      tools: ["read", "edit", "write", "bash", "ls", "find", "grep"],
      extensions: ["code-feedback"],
      cwd: args.cwd,
      intent: `Fix ${auto.length} finding${auto.length === 1 ? "" : "s"}`,
    });

    if (!fixerDispatch.ok) {
      knownIssues.push(
        `verify fixer dispatch failed: ${fixerDispatch.error ?? "unknown error"}`,
      );
      break;
    }

    const parsedFixer = parseJsonReport(
      fixerDispatch.stdout,
      FixerReportSchema,
    );
    if (!parsedFixer.ok) {
      knownIssues.push(
        `verify fixer round ${round + 1} unproductive: ${parsedFixer.error}`,
      );
      break;
    }
    fixed.push(...parsedFixer.data.fixed);

    // 4c. Re-run validation to catch regressions. Single-shot: we
    // only want a regression signal here, not another nested fix loop.
    const postValidation = await runValidation({
      dispatch: args.dispatch,
      cwd: args.cwd,
      maxFixRounds: 1,
    });
    validationReport = postValidation.report ?? validationReport;
    const newFailures = postValidation.knownIssues.filter(
      (s) => !initialValidationKeys.has(validationKey(s)),
    );
    if (newFailures.length > 0) {
      for (const s of newFailures) knownIssues.push(s);
      // Terminate: no further fix rounds on validation regression.
      auto = [];
      break;
    }

    // 4d. Re-run reviewers on the updated diff.
    const roundDiff = await args.getDiff();
    const { reports: roundReports } = await runReviewers({
      dispatch: args.dispatch,
      diff: roundDiff,
      archNotes: args.archNotes,
      taskListSummary: args.taskListSummary,
      cwd: args.cwd,
    });
    reviewerReports = roundReports;
    const roundSynth = synthesizeFindings(roundReports);
    const stillPresentKeys = new Set(roundSynth.auto.map(findingKey));
    // Keep only the originally-auto findings that still appear.
    auto = auto.filter((f) => stillPresentKeys.has(findingKey(f)));

    if (auto.length === 0) break;
  }

  // --- Step 5: leftover auto findings → knownIssues ----------------
  for (const f of auto) knownIssues.push(f);

  return {
    validationReport,
    reviewerReports,
    fixed,
    knownIssues,
    skippedReviewers,
  };
}
