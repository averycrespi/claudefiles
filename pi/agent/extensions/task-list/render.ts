/**
 * Rendering for the task-list extension.
 *
 * Pure helpers (`glyphFor`, `styleFor`, `summarizeCounts`,
 * `truncateWithPriority`) are unit-tested in `render.test.ts`.
 * `renderWidgetLines` produces a `string[]` body for `pi.ui.setWidget`.
 */

import type { Task, TaskListState, TaskStatus } from "./state.ts";

export interface WidgetTheme {
  fg(
    color: "success" | "accent" | "muted" | "error" | "dim",
    text: string,
  ): string;
  bold(text: string): string;
  strikethrough(text: string): string;
}

/**
 * Tasks completed in the last {@link RECENT_COMPLETED_MS} are treated
 * as "hot" and kept in the truncation window so the user sees the
 * transition from in-progress → done before the task scrolls away.
 */
const RECENT_COMPLETED_MS = 30_000;

export function glyphFor(status: TaskStatus): string {
  switch (status) {
    case "pending":
      return "◻";
    case "in_progress":
      return "◼";
    case "completed":
      return "✔";
    case "failed":
      return "✗";
  }
}

export interface TaskStyle {
  color: "success" | "accent" | "muted" | "error";
  bold: boolean;
  dim: boolean;
  strikethrough: boolean;
}

export function styleFor(status: TaskStatus): TaskStyle {
  switch (status) {
    case "completed":
      return {
        color: "success",
        bold: false,
        dim: false,
        strikethrough: true,
      };
    case "in_progress":
      return { color: "accent", bold: true, dim: false, strikethrough: false };
    case "pending":
      return { color: "muted", bold: false, dim: true, strikethrough: false };
    case "failed":
      return { color: "error", bold: true, dim: false, strikethrough: false };
  }
}

export function summarizeCounts(tasks: { status: TaskStatus }[]): string {
  let done = 0;
  let active = 0;
  let pending = 0;
  let failed = 0;
  for (const t of tasks) {
    if (t.status === "completed") done++;
    else if (t.status === "in_progress") active++;
    else if (t.status === "pending") pending++;
    else if (t.status === "failed") failed++;
  }
  return `${tasks.length} tasks (${done} done, ${active} in progress, ${pending} pending, ${failed} failed)`;
}

/**
 * Priority order:
 *   1. Recently-completed (< 30s by `completedAt`)
 *   2. in_progress
 *   3. pending
 *   4. older-completed
 *   5. failed
 *
 * Original order is preserved within each bucket; at most `budget`
 * items are returned.
 */
export function truncateWithPriority(
  tasks: Task[],
  budget: number,
  now: number,
): Task[] {
  const recentCompleted: Task[] = [];
  const inProgress: Task[] = [];
  const pending: Task[] = [];
  const olderCompleted: Task[] = [];
  const failed: Task[] = [];

  for (const task of tasks) {
    if (task.status === "completed") {
      const age =
        task.completedAt !== undefined ? now - task.completedAt : Infinity;
      if (age < RECENT_COMPLETED_MS) {
        recentCompleted.push(task);
      } else {
        olderCompleted.push(task);
      }
    } else if (task.status === "in_progress") {
      inProgress.push(task);
    } else if (task.status === "pending") {
      pending.push(task);
    } else if (task.status === "failed") {
      failed.push(task);
    }
  }

  const ordered = [
    ...recentCompleted,
    ...inProgress,
    ...pending,
    ...olderCompleted,
    ...failed,
  ];
  if (budget <= 0) return [];
  return ordered.slice(0, budget);
}

/**
 * Maximum number of lines this widget chooses to render.
 * Pi can render more, but the task-list intentionally stays compact.
 */
const MAX_WIDGET_LINES = 7;

export interface RenderWidgetLinesOptions {
  rows?: number;
}

/**
 * Build a `string[]` body for `pi.ui.setWidget("task-list", ...)`.
 *
 * Layout:
 *   - Line 0: `summarizeCounts(...)` header.
 *   - Lines 1–N: one line per truncated task (`glyph title [· detail]`).
 *   - Optional trailing `+N more` when tasks were dropped.
 *
 * Cap: `MAX_WIDGET_LINES` (7) — 1 header + up to 6 task rows, or
 * 1 header + 5 rows + "+N more" when the total exceeds 6 tasks.
 *
 * Returns `[]` when the task list is empty (caller should dismiss the
 * widget via `setWidget(key, undefined)`).
 */
function baseTaskLine(task: Task): string {
  const glyph = glyphFor(task.status);
  let line = `${glyph} ${task.title}`;
  if (task.status === "in_progress" && task.activity) {
    line += ` · ${task.activity}`;
  } else if (task.status === "failed" && task.failureReason) {
    line += ` · ${task.failureReason}`;
  }
  return `\t${line}`;
}

function keptTasks(state: TaskListState): { kept: Task[]; dropped: number } {
  const tasks = state.tasks;
  const maxTaskRows = MAX_WIDGET_LINES - 1; // 9
  const needsMore = tasks.length > maxTaskRows;
  const budget = needsMore ? maxTaskRows - 1 : maxTaskRows;
  const kept = truncateWithPriority(tasks, budget, Date.now());
  return { kept, dropped: tasks.length - kept.length };
}

export function renderWidgetLines(
  state: TaskListState,
  _opts: RenderWidgetLinesOptions = {},
): string[] {
  const tasks = state.tasks;
  if (tasks.length === 0) return [];

  const { kept, dropped } = keptTasks(state);

  const lines: string[] = [];
  lines.push(summarizeCounts(tasks));

  for (const task of kept) {
    lines.push(baseTaskLine(task));
  }

  if (dropped > 0) {
    lines.push(`\t+${dropped} more`);
  }

  return lines;
}

export function renderStyledWidgetLines(
  state: TaskListState,
  theme: WidgetTheme,
  _opts: RenderWidgetLinesOptions = {},
): string[] {
  const tasks = state.tasks;
  if (tasks.length === 0) return [];

  const { kept, dropped } = keptTasks(state);
  const lines: string[] = [summarizeCounts(tasks)];

  for (const task of kept) {
    switch (task.status) {
      case "completed":
        lines.push(
          `\t${theme.fg("success", `${glyphFor(task.status)} `)}${theme.fg("muted", theme.strikethrough(task.title))}`,
        );
        break;
      case "failed":
        lines.push(
          `\t${theme.fg("error", theme.bold(baseTaskLine(task).trimStart()))}`,
        );
        break;
      case "in_progress": {
        const head = `\t${theme.fg("accent", `${glyphFor(task.status)} `)}${theme.fg("accent", theme.bold(task.title))}`;
        lines.push(
          task.activity
            ? `${head}${theme.fg("muted", ` · ${task.activity}`)}`
            : head,
        );
        break;
      }
      case "pending":
        lines.push(
          `\t${theme.fg("muted", `${glyphFor(task.status)} `)}${theme.fg("dim", task.title)}`,
        );
        break;
    }
  }

  if (dropped > 0) {
    lines.push(`\t${theme.fg("muted", `+${dropped} more`)}`);
  }

  return lines;
}
