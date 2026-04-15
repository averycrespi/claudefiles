import type { Task } from "../../task-list/state.ts";
import type { Finding, ValidationReport } from "./schemas.ts";

/**
 * Verify phase result shape mirrored here (structurally compatible with
 * `RunVerifyResult` from phases/verify.ts) so report.ts stays free of
 * orchestration imports. Kept in sync with that file.
 */
export interface RunVerifyResult {
  validationReport: ValidationReport | null;
  reviewerReports: Record<string, { findings: Finding[] }>;
  fixed: string[];
  knownIssues: Array<string | Finding>;
  skippedReviewers: string[];
}

export interface ReportInput {
  designPath: string;
  branchName: string;
  commitsAhead: number;
  /** Defaults to "main" if omitted. */
  baseBranch?: string;
  tasks: Task[];
  /** `null` when verify was skipped (implement failed or cancelled). */
  verify: RunVerifyResult | null;
  /** Map of task id → HEAD sha captured after that task's commit landed. */
  commitShas?: Record<number, string>;
  /** Present when the run was cancelled by the user. */
  cancelled?: { elapsedMs: number };
}

const HEADER = "━━━ Autopilot Report ━━━";
const NEXT_FOOTER = "Review the branch, run /push or gh pr create when ready.";
/** Column (0-indexed) where verify section values start. */
const VERIFY_LABEL_WIDTH = 17;

type TaskGlyph = "✔" | "✗" | "◻";

function taskGlyph(task: Task, anyFailed: boolean): TaskGlyph {
  if (task.status === "completed") return "✔";
  if (task.status === "failed") return "✗";
  // pending / in_progress: if an earlier task failed, mark ◻ (not attempted).
  if (anyFailed) return "◻";
  // No failure but still pending — treat as not attempted as well.
  return "◻";
}

function shortSha(sha: string | undefined): string {
  if (!sha) return "(no-sha)";
  return `(${sha.slice(0, 7)})`;
}

function padRight(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

function validationGlyph(status: "pass" | "fail" | "skipped"): string {
  if (status === "pass") return "✔";
  if (status === "fail") return "✗";
  return "⊘";
}

/**
 * Pluralize the small number-of-findings counter used in the Known
 * issues line ("1 suggestion" / "3 blockers" / "2 important" …).
 */
function pluralize(n: number, word: string): string {
  if (n === 1) return `1 ${word}`;
  // crude plural: word + "s"; "important" → "important" stays irregular.
  if (word === "important") return `${n} important`;
  return `${n} ${word}s`;
}

/**
 * Formats the final Autopilot report as plain text matching the
 * layout in `.designs/2026-04-12-autopilot.md` lines 599-620.
 *
 * Handles four termination variants:
 *   1. Full success:  all tasks ✔, verify ok, `Known issues: none`.
 *   2. Implement failure on task N:  tasks 1..N-1 ✔, task N ✗ with
 *      failureReason, tasks N+1..end ◻.  Verify section is replaced
 *      with `skipped (implement failed)`.
 *   3. Verify partial:  findings listed per-line under `Known issues:`.
 *   4. Validation still failing:  surfaces as a string known issue and
 *      the automated-checks line reflects failing glyphs.
 */
export function formatReport(input: ReportInput): string {
  const baseBranch = input.baseBranch ?? "main";
  const lines: string[] = [];
  lines.push(HEADER);
  if (input.cancelled) {
    const sec = Math.max(0, Math.floor(input.cancelled.elapsedMs / 1000));
    const mm = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const ss = (sec % 60).toString().padStart(2, "0");
    lines.push(`Cancelled by user at ${mm}:${ss}`);
  }
  lines.push("");
  lines.push(`Design:  ${input.designPath}`);
  const commitWord = input.commitsAhead === 1 ? "commit" : "commits";
  lines.push(
    `Branch:  ${input.branchName}  (${input.commitsAhead} ${commitWord} ahead of ${baseBranch})`,
  );
  lines.push("");

  // --- Tasks section -------------------------------------------------
  const total = input.tasks.length;
  const completed = input.tasks.filter((t) => t.status === "completed").length;
  lines.push(`Tasks (${completed}/${total}):`);

  const anyFailed = input.tasks.some((t) => t.status === "failed");
  // Compute padding so commit shas align across all tasks. The visible
  // prefix of each task line is `  <glyph> <id>. <title>`, then spaces,
  // then `(sha)`. We pad titles to the max title length.
  const maxTitleLen = input.tasks.reduce(
    (m, t) => Math.max(m, t.title.length),
    0,
  );
  for (const task of input.tasks) {
    const glyph = taskGlyph(task, anyFailed);
    const sha = input.commitShas?.[task.id];
    const paddedTitle = padRight(task.title, maxTitleLen);
    lines.push(`  ${glyph} ${task.id}. ${paddedTitle}  ${shortSha(sha)}`);
    if (task.status === "failed" && task.failureReason) {
      // Indent failure reason under the task line for visibility.
      lines.push(`      └ ${task.failureReason}`);
    }
  }
  lines.push("");

  // --- Verify section -----------------------------------------------
  lines.push("Verify:");
  if (input.verify === null) {
    const reason = input.cancelled ? "cancelled by user" : "implement failed";
    lines.push(`  skipped (${reason})`);
  } else {
    const v = input.verify;
    // Automated checks line.
    const vr = v.validationReport;
    const testGlyph = vr ? validationGlyph(vr.test.status) : "⊘";
    const lintGlyph = vr ? validationGlyph(vr.lint.status) : "⊘";
    const tcGlyph = vr ? validationGlyph(vr.typecheck.status) : "⊘";
    lines.push(
      `  ${padRight("Automated checks:", VERIFY_LABEL_WIDTH)}  ${testGlyph} tests  ${lintGlyph} lint  ${tcGlyph} typecheck`,
    );

    // Reviewers line.
    const reviewerNames = ["plan-completeness", "integration", "security"];
    const skipped = new Set(v.skippedReviewers);
    const reviewerParts = reviewerNames.map((n) =>
      skipped.has(n) ? `${n} (skipped)` : n,
    );
    lines.push(
      `  ${padRight("Reviewers:", VERIFY_LABEL_WIDTH)}  ${reviewerParts.join("  ")}`,
    );

    // Fixed line.
    const fixedCount = v.fixed.length;
    lines.push(
      `  ${padRight("Fixed:", VERIFY_LABEL_WIDTH)}  ${fixedCount} ${fixedCount === 1 ? "finding" : "findings"}`,
    );

    // Known issues line + details.
    const known = v.knownIssues;
    if (known.length === 0) {
      lines.push(`  ${padRight("Known issues:", VERIFY_LABEL_WIDTH)}  none`);
    } else {
      // Count findings by severity for the summary line; strings count
      // as their own category.
      let blockers = 0;
      let importants = 0;
      let suggestions = 0;
      let stringCount = 0;
      for (const k of known) {
        if (typeof k === "string") {
          stringCount++;
          continue;
        }
        if (k.severity === "blocker") blockers++;
        else if (k.severity === "important") importants++;
        else suggestions++;
      }
      const summaryParts: string[] = [];
      if (blockers > 0) summaryParts.push(pluralize(blockers, "blocker"));
      if (importants > 0) summaryParts.push(pluralize(importants, "important"));
      if (suggestions > 0)
        summaryParts.push(pluralize(suggestions, "suggestion"));
      if (stringCount > 0) summaryParts.push(pluralize(stringCount, "issue"));
      lines.push(
        `  ${padRight("Known issues:", VERIFY_LABEL_WIDTH)}  ${summaryParts.join(", ")}`,
      );
      for (const k of known) {
        if (typeof k === "string") {
          lines.push(`    └ ${k}`);
        } else {
          lines.push(
            `    └ ${k.file}:${k.line} | ${k.severity} | ${k.description}`,
          );
        }
      }
    }
  }
  lines.push("");

  // --- Next footer ---------------------------------------------------
  lines.push("Next:");
  lines.push(`  ${NEXT_FOOTER}`);

  return lines.join("\n");
}
