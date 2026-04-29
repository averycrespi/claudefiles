import type { Task } from "../../task-list/state.ts";
import type { Finding, ValidationReport } from "./schemas.ts";
import {
  formatHeader,
  formatCancelledBanner,
  formatLabelValueRow,
} from "../../_workflow-core/report.ts";

export type { RunVerifyResult } from "../phases/verify.ts";
import type { RunVerifyResult } from "../phases/verify.ts";

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

/** Column (0-indexed) where verify section values start. */
const VERIFY_LABEL_WIDTH = 17;

type TaskGlyph = "✔" | "✗" | "◻";

function taskGlyph(task: Task, anyFailed: boolean): TaskGlyph {
  if (task.status === "completed") return "✔";
  if (task.status === "failed") return "✗";
  if (anyFailed) return "◻";
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

function pluralize(n: number, word: string): string {
  if (n === 1) return `1 ${word}`;
  if (word === "important") return `${n} important`;
  return `${n} ${word}s`;
}

function formatTasksSection(
  tasks: Task[],
  commitShas: Record<number, string> | undefined,
): string[] {
  const lines: string[] = [];
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  lines.push(`Tasks (${completed}/${total}):`);

  const anyFailed = tasks.some((t) => t.status === "failed");
  const maxTitleLen = tasks.reduce((m, t) => Math.max(m, t.title.length), 0);
  for (const task of tasks) {
    const glyph = taskGlyph(task, anyFailed);
    const sha = commitShas?.[task.id];
    const paddedTitle = padRight(task.title, maxTitleLen);
    lines.push(`  ${glyph} ${task.id}. ${paddedTitle}  ${shortSha(sha)}`);
    if (task.status === "failed" && task.failureReason) {
      lines.push(`      └ ${task.failureReason}`);
    }
  }
  return lines;
}

function formatVerifySection(
  verify: RunVerifyResult | null,
  cancelled?: { elapsedMs: number },
): string[] {
  const lines: string[] = ["Verify:"];
  if (verify === null) {
    const reason = cancelled ? "cancelled by user" : "implement failed";
    lines.push(`  skipped (${reason})`);
    return lines;
  }

  const v = verify;
  const vr = v.validationReport;
  const testGlyph = vr ? validationGlyph(vr.test.status) : "⊘";
  const lintGlyph = vr ? validationGlyph(vr.lint.status) : "⊘";
  const tcGlyph = vr ? validationGlyph(vr.typecheck.status) : "⊘";
  lines.push(
    `  ${padRight("Automated checks:", VERIFY_LABEL_WIDTH)}  ${testGlyph} tests  ${lintGlyph} lint  ${tcGlyph} typecheck`,
  );

  const reviewerNames = ["plan-completeness", "integration", "security"];
  const skipped = new Set(v.skippedReviewers);
  const reviewerParts = reviewerNames.map((n) =>
    skipped.has(n) ? `${n} (skipped)` : n,
  );
  lines.push(
    `  ${padRight("Reviewers:", VERIFY_LABEL_WIDTH)}  ${reviewerParts.join("  ")}`,
  );

  const fixedCount = v.fixed.length;
  lines.push(
    `  ${padRight("Fixed:", VERIFY_LABEL_WIDTH)}  ${fixedCount} ${fixedCount === 1 ? "finding" : "findings"}`,
  );

  const known = v.knownIssues;
  if (known.length === 0) {
    lines.push(`  ${padRight("Known issues:", VERIFY_LABEL_WIDTH)}  none`);
  } else {
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

  return lines;
}

export function formatAutopilotReport(input: ReportInput): string[] {
  const baseBranch = input.baseBranch ?? "main";
  const lines: string[] = [];
  lines.push(formatHeader("Autopilot Report"));
  if (input.cancelled) {
    lines.push(formatCancelledBanner(input.cancelled.elapsedMs));
  }
  lines.push("");
  lines.push(
    formatLabelValueRow("Design", input.designPath, { labelWidth: 8 }),
  );
  const noun = input.commitsAhead === 1 ? "commit" : "commits";
  lines.push(
    formatLabelValueRow(
      "Branch",
      `${input.branchName}  (${input.commitsAhead} ${noun} ahead of ${baseBranch})`,
      { labelWidth: 8 },
    ),
  );
  lines.push("");
  lines.push(...formatTasksSection(input.tasks, input.commitShas));
  lines.push("");
  lines.push(...formatVerifySection(input.verify, input.cancelled));
  return lines;
}
