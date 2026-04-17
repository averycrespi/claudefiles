import type { Theme } from "@mariozechner/pi-coding-agent";
import {
  createSubagentActivityTracker,
  type SubagentActivityTracker,
} from "../../subagents/api.ts";
import { taskList } from "../../task-list/api.ts";
import type { Task } from "../../task-list/api.ts";
import { glyphFor, styleFor, summarizeCounts } from "../../task-list/render.ts";

export interface StatusWidgetUi {
  setWidget(key: string, content: string[] | undefined): void;
}

/**
 * Minimal subset of the pi `Theme` API the widget uses. Accepts the full
 * `Theme` instance in production; tests can omit it entirely.
 */
export type WidgetTheme = Pick<Theme, "fg" | "bold" | "strikethrough">;

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

export interface SubagentHandle {
  onEvent(event: unknown): void;
  finish(): void;
}

export type Stage = "plan" | "implement" | "verify";

const STAGES: Stage[] = ["plan", "implement", "verify"];
const STAGE_ARROW = "›";

export interface StatusWidget {
  setStage(stage: Stage | null): void;
  subagent(intent: string): SubagentHandle;
  renderLines(): string[];
  dispose(): void;
}

export interface StatusWidgetOptions {
  ui?: StatusWidgetUi;
  theme?: WidgetTheme;
  key?: string;
  now?: () => number;
  tickMs?: number;
}

const DEFAULT_KEY = "autopilot";
const DEFAULT_TICK_MS = 1000;
const MAX_EVENTS_SINGLE = 3;
const MAX_EVENTS_MULTI = 1;

interface LiveSubagent {
  id: number;
  intent: string;
  tracker: SubagentActivityTracker;
  startedAt: number;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function truncate(text: string, max = 100): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function createStatusWidget(
  opts: StatusWidgetOptions = {},
): StatusWidget {
  const ui = opts.ui;
  const theme = opts.theme;
  const key = opts.key ?? DEFAULT_KEY;
  const now = opts.now ?? Date.now;
  const tickMs = opts.tickMs ?? DEFAULT_TICK_MS;

  const muted = (text: string) => (theme ? theme.fg("muted", text) : text);
  const dim = (text: string) => (theme ? theme.fg("dim", text) : text);
  const accent = (text: string) => (theme ? theme.fg("accent", text) : text);
  const errorStyle = (text: string) => (theme ? theme.fg("error", text) : text);
  const bold = (text: string) => (theme ? theme.bold(text) : text);

  const renderTaskLine = (task: Task): string => {
    const style = styleFor(task.status);
    const glyph = glyphFor(task.status);
    const raw = `${glyph} ${task.id}. ${truncate(task.title, 64)}`;
    if (!theme) return raw;
    let out = raw;
    if (style.strikethrough) out = theme.strikethrough(out);
    if (style.bold) out = theme.bold(out);
    return theme.fg(style.color, out);
  };

  const startedAt = now();
  let stage: Stage | null = null;
  let nextId = 1;
  const live = new Map<number, LiveSubagent>();
  let disposed = false;

  const push = () => {
    if (disposed || !ui) return;
    ui.setWidget(key, renderLines());
  };

  const tick = setInterval(push, tickMs);
  const unsubscribe = taskList.subscribe(push);

  function renderLines(): string[] {
    const lines: string[] = [];
    const elapsed = formatClock(now() - startedAt);
    const breadcrumb = STAGES.map((s) =>
      s === stage ? bold(accent(s)) : muted(s),
    ).join(` ${muted(STAGE_ARROW)} `);
    lines.push(
      `${bold(accent("autopilot"))}${muted(" · ")}${breadcrumb}${muted(` · ${elapsed}`)}`,
    );

    const maxEvents = live.size >= 2 ? MAX_EVENTS_MULTI : MAX_EVENTS_SINGLE;
    for (const entry of live.values()) {
      const state = entry.tracker.state;
      const subElapsed = formatClock(now() - entry.startedAt);
      lines.push(`  ${muted("↳")} ${entry.intent} ${dim(`(${subElapsed})`)}`);
      const events = state.recentEvents ?? [];
      const shown = events.slice(-maxEvents);
      for (const e of shown) {
        const style = e.kind === "stderr" ? errorStyle : dim;
        const prefix = e.kind === "stderr" ? "stderr: " : "";
        lines.push(`     ${dim("-")} ${style(prefix + e.text)}`);
      }
    }

    const tasks = taskList.all();
    if (tasks.length > 0) {
      lines.push(`  ${muted(summarizeCounts(tasks))}`);
      const window = taskWindow(tasks);
      if (window.length > 0 && window[0].id > 1) {
        lines.push(`    ${dim(`… ${window[0].id - 1} earlier`)}`);
      }
      for (const task of window) {
        lines.push(`    ${renderTaskLine(task)}`);
      }
      const last = window[window.length - 1];
      if (last && last.id < tasks.length) {
        lines.push(`    ${dim(`… ${tasks.length - last.id} more`)}`);
      }
    }

    lines.push(dim("type /autopilot-cancel to stop"));
    return lines;
  }

  return {
    setStage(next) {
      stage = next;
      push();
    },
    subagent(intent) {
      const id = nextId++;
      const tracker = createSubagentActivityTracker({
        toolCallId: `autopilot:${id}`,
        roleLabel: intent,
        intent,
        showActivity: false,
        hasUI: false,
      });
      const entry: LiveSubagent = {
        id,
        intent,
        tracker,
        startedAt: now(),
      };
      live.set(id, entry);
      push();
      return {
        onEvent(event) {
          tracker.handleEvent(event);
          push();
        },
        finish() {
          live.delete(id);
          push();
        },
      };
    },
    renderLines,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(tick);
      unsubscribe();
      if (ui) ui.setWidget(key, undefined);
      live.clear();
    },
  };
}
