/**
 * Rendering for the task-list extension.
 *
 * Pure helpers (`glyphFor`, `styleFor`, `summarizeCounts`,
 * `truncateWithPriority`) are unit-tested in `render.test.ts`. The
 * impure bit is `renderTaskListMessage`, which produces a pi-tui
 * `Component` tree that Pi's interactive mode renders when a
 * `task-list` custom message is displayed.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { Text } from "@mariozechner/pi-tui";
import type { Task, TaskListState, TaskStatus } from "./state.ts";

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
  let open = 0;
  for (const t of tasks) {
    if (t.status === "completed") done++;
    else if (t.status === "in_progress") active++;
    else if (t.status === "pending") open++;
  }
  return `${tasks.length} tasks (${done} done, ${active} in progress, ${open} open)`;
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
 * Apply a style to `text` using the theme. Theme colors are applied
 * last so ANSI reset sequences in bold/strikethrough don't clobber
 * the foreground color.
 */
function applyStyle(theme: Theme, style: TaskStyle, text: string): string {
  let out = text;
  if (style.strikethrough) out = theme.strikethrough(out);
  if (style.bold) out = theme.bold(out);
  return theme.fg(style.color, out);
}

export interface RenderTaskListOptions {
  rows?: number;
}

/**
 * Build the `Component` Pi draws for a `task-list` custom message.
 *
 * Layout:
 *   - Header: `summarizeCounts(...)`
 *   - One line per truncated task: `glyph title [· activity]`
 *   - Trailing `+N more` line when tasks were dropped by the budget.
 *
 * Budget: `min(10, max(3, rows - 14))`, leaving room for chrome
 * (header, footer, input, surrounding messages).
 */
export function renderTaskListMessage(
  state: TaskListState,
  options: RenderTaskListOptions,
  theme: Theme,
): Component {
  const rows = options.rows ?? 40;
  const budget = Math.min(10, Math.max(3, rows - 14));
  const tasks = state.tasks;
  const kept = truncateWithPriority(tasks, budget, Date.now());
  const dropped = tasks.length - kept.length;

  const lines: string[] = [];
  lines.push(theme.fg("muted", summarizeCounts(tasks)));

  for (const task of kept) {
    const style = styleFor(task.status);
    const glyph = glyphFor(task.status);
    let line = applyStyle(theme, style, `${glyph} ${task.title}`);
    if (task.status === "in_progress" && task.activity) {
      line += " " + theme.fg("dim", `· ${task.activity}`);
    } else if (task.status === "failed" && task.failureReason) {
      line += " " + theme.fg("error", `· ${task.failureReason}`);
    }
    lines.push(line);
  }

  if (dropped > 0) {
    lines.push(theme.fg("muted", `+${dropped} more`));
  }

  return new Text(lines.join("\n"), 0, 0);
}
