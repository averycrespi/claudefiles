import type { Widget, WidgetTheme } from "../../_workflow-core/lib/widget.ts";
import { renderClock, renderSubagents } from "../../_workflow-core/render.ts";
import type { IterationRecord } from "./state.ts";

const MAX_HISTORY_BEFORE = 2;

function truncate(text: string, max = 100): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function renderHistoryRow(r: IterationRecord): string {
  const glyph = r.reflection
    ? "🪞"
    : r.outcome === "complete" || r.outcome === "in_progress"
      ? "✔"
      : r.outcome === "failed"
        ? "✗"
        : r.outcome === "timeout"
          ? "⏱"
          : "•";
  const sha =
    r.headAfter !== r.headBefore ? ` (${r.headAfter.slice(0, 7)})` : "";
  return `${glyph} ${r.iteration}. ${truncate(r.summary, 64)}${sha}`;
}

function renderHistoryBlock(
  history: IterationRecord[],
  theme: WidgetTheme | undefined,
): string[] {
  if (history.length === 0) return [];
  const muted = (text: string) => (theme ? theme.fg("muted", text) : text);
  const lines: string[] = [];
  const done = history.filter(
    (r) => r.outcome === "in_progress" || r.outcome === "complete",
  ).length;
  const commits = history.filter((r) => r.headAfter !== r.headBefore).length;
  const timeouts = history.filter((r) => r.outcome === "timeout").length;
  lines.push(
    `  ${muted(`history: ${done} done (${commits} commits) · ${timeouts} timeouts`)}`,
  );
  const window = history.slice(
    Math.max(0, history.length - MAX_HISTORY_BEFORE),
  );
  for (const r of window) {
    lines.push(`    ${renderHistoryRow(r)}`);
  }
  return lines;
}

export function setupAutoralphWidget(widget: Widget): {
  setIteration(i: number, max: number): void;
  setHistory(h: IterationRecord[]): void;
  dispose(): void;
} {
  let iteration = 0;
  let maxIterations = 0;
  let history: IterationRecord[] = [];

  widget.setTitle(
    () =>
      `${widget.theme?.bold("autoralph") ?? "autoralph"} · iter ${iteration}/${maxIterations} · ${renderClock(widget.elapsedMs())}`,
  );
  widget.setBody(() => [
    ...renderSubagents(widget.subagents, { theme: widget.theme }),
    ...renderHistoryBlock(history, widget.theme),
  ]);
  widget.setFooter("type /autoralph-cancel to stop");

  return {
    setIteration(i: number, max: number) {
      iteration = i;
      maxIterations = max;
      widget.invalidate();
    },
    setHistory(h: IterationRecord[]) {
      history = h;
      widget.invalidate();
    },
    dispose() {},
  };
}
