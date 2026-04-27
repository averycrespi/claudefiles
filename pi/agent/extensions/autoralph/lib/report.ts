import type { IterationRecord } from "./history.ts";
import {
  formatHeader,
  formatCancelledBanner,
  formatLabelValueRow,
  formatGitInfoBlock,
} from "../../_workflow-core/report.ts";

export type FinalOutcome =
  | "complete"
  | "max-iterations"
  | "failed"
  | "stuck"
  | "cancelled";

export interface ReportInput {
  designPath: string;
  branchName: string;
  commitsAhead: number;
  taskFilePath: string;
  finalHandoff: string | null;
  totalElapsedMs: number;
  outcome: FinalOutcome;
  history: IterationRecord[];
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function outcomeLine(
  outcome: FinalOutcome,
  history: IterationRecord[],
  elapsedMs: number,
): string[] {
  const elapsed = formatElapsed(elapsedMs);
  const n = history.length;
  switch (outcome) {
    case "complete":
      return [`Outcome: complete  (after ${n} iterations, ${elapsed} elapsed)`];
    case "max-iterations":
      return [`Outcome: max-iterations  (${n} iterations, ${elapsed} elapsed)`];
    case "failed": {
      const last = history[history.length - 1];
      const reason = last?.summary ?? "no summary available";
      return [
        `Outcome: failed  (${n} iterations, ${elapsed} elapsed)`,
        `Reason:  ${reason}`,
      ];
    }
    case "stuck":
      return [
        `Outcome: stuck (3 consecutive timeouts)  (${n} iterations, ${elapsed} elapsed)`,
      ];
    case "cancelled":
      return [`Outcome: cancelled  (${n} iterations, ${elapsed} elapsed)`];
  }
}

function rowGlyph(r: IterationRecord): string {
  if (r.reflection) return "🪞";
  switch (r.outcome) {
    case "complete":
    case "in_progress":
      return "✔ ";
    case "failed":
      return "✗ ";
    case "timeout":
      return "⏱ ";
    case "parse_error":
    case "dispatch_error":
      return "✗ ";
  }
}

function shaSuffix(r: IterationRecord): string {
  return r.headAfter !== r.headBefore
    ? `(${r.headAfter.slice(0, 7)})`
    : "(no commit)";
}

export function formatAutoralphReport(input: ReportInput): string[] {
  const lines: string[] = [];
  lines.push(formatHeader("Autoralph Report"));
  if (input.outcome === "cancelled") {
    lines.push(formatCancelledBanner(input.totalElapsedMs));
  }
  lines.push("");
  lines.push(
    formatLabelValueRow("Design", input.designPath, { labelWidth: 8 }),
  );
  lines.push(
    ...formatGitInfoBlock({
      branch: input.branchName,
      commitsAhead: input.commitsAhead,
    }),
  );
  lines.push(
    ...outcomeLine(input.outcome, input.history, input.totalElapsedMs),
  );
  lines.push("");
  lines.push(`Iterations (${input.history.length}):`);
  for (const r of input.history) {
    const glyph = rowGlyph(r);
    const num = String(r.iteration).padStart(2, " ");
    const summary = r.summary;
    const sha = shaSuffix(r);
    lines.push(`  ${glyph} ${num}. ${summary}    ${sha}`);
  }
  lines.push("");
  lines.push(`Final task file: ${input.taskFilePath}`);
  if (input.finalHandoff) {
    lines.push(`Final handoff:   ${JSON.stringify(input.finalHandoff)}`);
  }
  return lines;
}
