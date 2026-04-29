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
 * Done/failed tasks completed in the last {@link RECENT_COMPLETED_MS} are
 * treated as recent so the widget shows fresh outcomes before they sink into
 * older history within their section.
 */
const RECENT_COMPLETED_MS = 30_000;

/**
 * Maximum number of lines this widget chooses to render.
 * Pi can render more, but the task-list intentionally stays compact.
 */
const MAX_WIDGET_LINES = 7;
const CONTENT_ROW_BUDGET = MAX_WIDGET_LINES - 1;
const DEFAULT_SECTION_TARGET = 1;

type SectionKey = "done" | "failed" | "in_progress" | "pending";

interface SectionPlan {
  key: SectionKey;
  label: string;
  tasks: Task[];
  target: number;
  visibleRows: number;
}

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
  let failed = 0;
  let active = 0;
  let pending = 0;
  for (const t of tasks) {
    if (t.status === "completed") done++;
    else if (t.status === "failed") failed++;
    else if (t.status === "in_progress") active++;
    else if (t.status === "pending") pending++;
  }
  return `${tasks.length} tasks (${done} done, ${failed} failed, ${active} in progress, ${pending} pending)`;
}

/**
 * Legacy flat-priority helper kept for compatibility with unit tests and any
 * external consumers. Original order is preserved within each bucket; at most
 * `budget` items are returned.
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

export interface RenderWidgetLinesOptions {
  rows?: number;
}

function baseTaskText(task: Task): string {
  const glyph = glyphFor(task.status);
  let line = `${glyph} ${task.title}`;
  if (task.status === "in_progress" && task.activity) {
    line += ` · ${task.activity}`;
  } else if (task.status === "failed" && task.failureReason) {
    line += ` · ${task.failureReason}`;
  }
  return line;
}

function styledTaskText(task: Task, theme: WidgetTheme): string {
  switch (task.status) {
    case "completed":
      return `${theme.fg("success", `${glyphFor(task.status)} `)}${theme.fg("muted", theme.strikethrough(task.title))}`;
    case "failed":
      return theme.fg("error", theme.bold(baseTaskText(task)));
    case "in_progress": {
      const head = `${theme.fg("accent", `${glyphFor(task.status)} `)}${theme.fg("accent", theme.bold(task.title))}`;
      return task.activity
        ? `${head}${theme.fg("muted", ` · ${task.activity}`)}`
        : head;
    }
    case "pending":
      return `${theme.fg("muted", `${glyphFor(task.status)} `)}${theme.fg("dim", task.title)}`;
  }
}

function isRecentFinishedTask(task: Task, now: number): boolean {
  const age =
    task.completedAt !== undefined ? now - task.completedAt : Infinity;
  return age < RECENT_COMPLETED_MS;
}

function bucketRecentFirst(tasks: Task[], now: number): Task[] {
  const recent: Task[] = [];
  const older: Task[] = [];

  for (const task of tasks) {
    if (isRecentFinishedTask(task, now)) recent.push(task);
    else older.push(task);
  }

  return [...recent, ...older];
}

function buildSectionPlans(tasks: Task[], now: number): SectionPlan[] {
  const done: Task[] = [];
  const failed: Task[] = [];
  const inProgress: Task[] = [];
  const pending: Task[] = [];

  for (const task of tasks) {
    if (task.status === "completed") {
      done.push(task);
    } else if (task.status === "failed") {
      failed.push(task);
    } else if (task.status === "in_progress") {
      inProgress.push(task);
    } else if (task.status === "pending") {
      pending.push(task);
    }
  }

  return [
    {
      key: "done",
      label: "done",
      tasks: bucketRecentFirst(done, now),
      target: DEFAULT_SECTION_TARGET,
      visibleRows: 0,
    },
    {
      key: "failed",
      label: "failed",
      tasks: bucketRecentFirst(failed, now),
      target: DEFAULT_SECTION_TARGET,
      visibleRows: 0,
    },
    {
      key: "in_progress",
      label: "in progress",
      tasks: inProgress,
      target: DEFAULT_SECTION_TARGET,
      visibleRows: 0,
    },
    {
      key: "pending",
      label: "pending",
      tasks: pending,
      target: DEFAULT_SECTION_TARGET,
      visibleRows: 0,
    },
  ];
}

function allocateSectionRows(
  sections: SectionPlan[],
  budget: number,
): SectionPlan[] {
  const planned = sections.map((section) => ({ ...section }));
  let remaining = budget;

  for (const section of planned) {
    if (section.tasks.length === 0 || remaining === 0) continue;
    section.visibleRows = 1;
    remaining--;
  }

  for (const section of planned) {
    if (remaining === 0) break;
    const desired = Math.min(section.tasks.length, section.target);
    const needed = desired - section.visibleRows;
    if (needed <= 0) continue;
    const grant = Math.min(needed, remaining);
    section.visibleRows += grant;
    remaining -= grant;
  }

  const borrowOrder: SectionKey[] = [
    "in_progress",
    "pending",
    "failed",
    "done",
  ];
  while (remaining > 0) {
    let granted = false;
    for (const key of borrowOrder) {
      if (remaining === 0) break;
      const section = planned.find((candidate) => candidate.key === key);
      if (!section) continue;
      if (section.visibleRows >= section.tasks.length) continue;
      section.visibleRows++;
      remaining--;
      granted = true;
    }
    if (!granted) break;
  }

  return planned;
}

function renderSectionedLines(
  tasks: Task[],
  now: number,
  renderTaskText: (task: Task) => string,
): string[] {
  const sections = allocateSectionRows(
    buildSectionPlans(tasks, now),
    CONTENT_ROW_BUDGET,
  );
  const visibleSections = sections.filter((section) => section.visibleRows > 0);
  const prefixes = visibleSections.map((section) => {
    const hiddenCount = section.tasks.length - section.visibleRows;
    return `${section.label}${hiddenCount > 0 ? ` (+${hiddenCount} more)` : ""}: `;
  });
  const prefixWidth = prefixes.reduce(
    (max, prefix) => Math.max(max, prefix.length),
    0,
  );
  const lines: string[] = [summarizeCounts(tasks)];

  for (const [sectionIndex, section] of visibleSections.entries()) {
    const prefix = prefixes[sectionIndex];
    const firstRowLeader = prefix.padEnd(prefixWidth);
    const continuationLeader = " ".repeat(prefixWidth);

    for (let index = 0; index < section.visibleRows; index++) {
      const task = section.tasks[index];
      const leader = index === 0 ? firstRowLeader : continuationLeader;
      lines.push(`${leader}${renderTaskText(task)}`);
    }
  }

  return lines;
}

/**
 * Build a `string[]` body for `pi.ui.setWidget("task-list", ...)`.
 *
 * Layout:
 *   - Line 0: `summarizeCounts(...)` header.
 *   - Lines 1–N: sectioned task rows in done/failed/in progress/pending order.
 *   - Rendering always uses the same sectioned layout, even when all tasks fit.
 *
 * Cap: `MAX_WIDGET_LINES` (7) — 1 header + up to 6 content rows.
 *
 * Returns `[]` when the task list is empty (caller should dismiss the
 * widget via `setWidget(key, undefined)`).
 */
export function renderWidgetLines(
  state: TaskListState,
  _opts: RenderWidgetLinesOptions = {},
): string[] {
  const tasks = state.tasks;
  if (tasks.length === 0) return [];

  return renderSectionedLines(tasks, Date.now(), baseTaskText);
}

export function renderStyledWidgetLines(
  state: TaskListState,
  theme: WidgetTheme,
  _opts: RenderWidgetLinesOptions = {},
): string[] {
  const tasks = state.tasks;
  if (tasks.length === 0) return [];

  return renderSectionedLines(tasks, Date.now(), (task) =>
    styledTaskText(task, theme),
  );
}
