import {
  createSubagentActivityTracker,
  type SubagentActivityTracker,
} from "../../subagents/api.ts";
import { taskList } from "../../task-list/api.ts";
import { summarizeCounts } from "../../task-list/render.ts";

export interface StatusWidgetUi {
  setWidget(key: string, content: string[] | undefined): void;
}

export interface SubagentHandle {
  onEvent(event: unknown): void;
  finish(): void;
}

export interface StatusWidget {
  setPhase(label: string): void;
  subagent(intent: string): SubagentHandle;
  renderLines(): string[];
  dispose(): void;
}

export interface StatusWidgetOptions {
  ui?: StatusWidgetUi;
  key?: string;
  now?: () => number;
  tickMs?: number;
}

const DEFAULT_KEY = "autopilot";
const DEFAULT_TICK_MS = 1000;
const MAX_RECENT_EVENTS = 3;

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
  const key = opts.key ?? DEFAULT_KEY;
  const now = opts.now ?? Date.now;
  const tickMs = opts.tickMs ?? DEFAULT_TICK_MS;

  const startedAt = now();
  let phase = "Starting";
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
    lines.push(`autopilot · ${phase} · ${elapsed}`);

    for (const entry of live.values()) {
      const state = entry.tracker.state;
      const subElapsed = formatClock(now() - entry.startedAt);
      lines.push(`  ↳ ${entry.intent} (${subElapsed})`);
      const events = state.recentEvents ?? [];
      const shown = events.slice(-MAX_RECENT_EVENTS);
      for (const e of shown) {
        const prefix = e.kind === "stderr" ? "stderr: " : "";
        lines.push(`     - ${truncate(prefix + e.text)}`);
      }
    }

    const tasks = taskList.all();
    if (tasks.length > 0) {
      lines.push(`  ${summarizeCounts(tasks)}`);
      const active = tasks.find((t) => t.status === "in_progress");
      if (active) {
        lines.push(`    ◼ ${truncate(active.title, 70)}`);
      }
    }

    lines.push("type /autopilot-cancel to stop");
    return lines;
  }

  return {
    setPhase(label) {
      phase = label;
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
