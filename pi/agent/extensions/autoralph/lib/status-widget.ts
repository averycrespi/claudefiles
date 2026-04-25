import type { Theme } from "@mariozechner/pi-coding-agent";
import {
  createSubagentActivityTracker,
  type SubagentActivityTracker,
} from "../../subagents/api.ts";
import type { IterationRecord } from "./history.ts";

export interface StatusWidgetUi {
  setWidget(key: string, content: string[] | undefined): void;
}

export type WidgetTheme = Pick<Theme, "fg" | "bold" | "strikethrough">;

export interface SubagentHandle {
  onEvent(event: unknown): void;
  finish(): void;
}

export interface StatusWidget {
  setIteration(iteration: number, max: number): void;
  setHistory(history: IterationRecord[]): void;
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

const DEFAULT_KEY = "autoralph";
const DEFAULT_TICK_MS = 1000;
const MAX_HISTORY_BEFORE = 2;
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

  const startedAt = now();
  let iteration = 0;
  let maxIterations = 0;
  let history: IterationRecord[] = [];
  let nextId = 1;
  const live = new Map<number, LiveSubagent>();
  let disposed = false;

  const push = () => {
    if (disposed || !ui) return;
    ui.setWidget(key, renderLines());
  };

  const tick = setInterval(push, tickMs);

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

  function renderLines(): string[] {
    const lines: string[] = [];
    const elapsed = formatClock(now() - startedAt);
    const header = `${bold(accent("autoralph"))}${muted(" · ")}${muted(`iter ${iteration}/${maxIterations}`)}${muted(` · ${elapsed}`)}`;
    lines.push(header);

    const maxEvents = live.size >= 2 ? MAX_EVENTS_MULTI : MAX_EVENTS_SINGLE;
    for (const entry of live.values()) {
      const state = entry.tracker.state;
      const subElapsed = formatClock(now() - entry.startedAt);
      lines.push(`  ${muted("↳")} ${entry.intent} ${dim(`(${subElapsed})`)}`);
      const events = (state.recentEvents ?? []).slice(-maxEvents);
      for (const e of events) {
        const style = e.kind === "stderr" ? errorStyle : dim;
        const prefix = e.kind === "stderr" ? "stderr: " : "";
        lines.push(`     ${dim("-")} ${style(prefix + e.text)}`);
      }
    }

    if (history.length > 0) {
      const done = history.filter(
        (r) => r.outcome === "in_progress" || r.outcome === "complete",
      ).length;
      const commits = history.filter(
        (r) => r.headAfter !== r.headBefore,
      ).length;
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
    }

    lines.push(dim("type /autoralph-cancel to stop"));
    return lines;
  }

  return {
    setIteration(n, max) {
      iteration = n;
      maxIterations = max;
      push();
    },
    setHistory(h) {
      history = h;
      push();
    },
    subagent(intent) {
      const id = nextId++;
      const tracker = createSubagentActivityTracker({
        toolCallId: `autoralph:${id}`,
        roleLabel: intent,
        intent,
        showActivity: false,
        hasUI: false,
      });
      const entry: LiveSubagent = { id, intent, tracker, startedAt: now() };
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
      if (ui) ui.setWidget(key, undefined);
      live.clear();
    },
  };
}
