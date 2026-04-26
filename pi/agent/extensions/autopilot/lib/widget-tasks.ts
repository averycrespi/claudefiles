import type { Task } from "../../task-list/api.ts";
import { glyphFor, styleFor, summarizeCounts } from "../../task-list/render.ts";

/**
 * Minimal theme subset the task-window renderer needs. Accepts the full Pi
 * `Theme` in production; tests can supply a plain object.
 */
export interface TaskWindowTheme {
  fg(kind: string, s: string): string;
  bold(s: string): string;
  strikethrough(s: string): string;
}

const MAX_TASKS_BEFORE = 2;
const MAX_TASKS_AFTER = 2;

/**
 * Return a window of at most five tasks around the "current" task: up to
 * {@link MAX_TASKS_BEFORE} tasks preceding the anchor, the anchor itself, and
 * up to {@link MAX_TASKS_AFTER} tasks following it. Anchor selection:
 *   1. The first `in_progress` task, if any.
 *   2. Otherwise the first `pending` task.
 *   3. Otherwise the last task in the list.
 *
 * Returns an empty array when there are no tasks.
 */
export function taskWindow(tasks: Task[]): Task[] {
  if (tasks.length === 0) return [];
  let anchor = tasks.findIndex((t) => t.status === "in_progress");
  if (anchor < 0) anchor = tasks.findIndex((t) => t.status === "pending");
  if (anchor < 0) anchor = tasks.length - 1;
  const start = Math.max(0, anchor - MAX_TASKS_BEFORE);
  const end = Math.min(tasks.length, anchor + MAX_TASKS_AFTER + 1);
  return tasks.slice(start, end);
}

function truncate(text: string, max = 64): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function renderTaskLine(task: Task, theme?: TaskWindowTheme): string {
  const style = styleFor(task.status);
  const glyph = glyphFor(task.status);
  const raw = `${glyph} ${task.id}. ${truncate(task.title)}`;
  if (!theme) return raw;
  let out = raw;
  if (style.strikethrough) out = theme.strikethrough(out);
  if (style.bold) out = theme.bold(out);
  return theme.fg(style.color, out);
}

/**
 * Renders the task-list section of the autopilot widget body.
 * Returns an empty array when there are no tasks.
 */
export function renderTaskWindowLines(
  tasks: Task[],
  theme?: TaskWindowTheme,
): string[] {
  if (tasks.length === 0) return [];
  const lines: string[] = [];

  const dim = (text: string) => (theme ? theme.fg("dim", text) : text);
  const muted = (text: string) => (theme ? theme.fg("muted", text) : text);

  lines.push(`  ${muted(summarizeCounts(tasks))}`);

  const window = taskWindow(tasks);
  if (window.length > 0 && window[0].id > 1) {
    lines.push(`    ${dim(`… ${window[0].id - 1} earlier`)}`);
  }
  for (const task of window) {
    lines.push(`    ${renderTaskLine(task, theme)}`);
  }
  const last = window[window.length - 1];
  if (last && last.id < tasks.length) {
    lines.push(`    ${dim(`… ${tasks.length - last.id} more`)}`);
  }

  return lines;
}
