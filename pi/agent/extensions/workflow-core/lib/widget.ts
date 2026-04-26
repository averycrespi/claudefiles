import type { SubagentSlot, ToolEvent } from "./types.ts";

export interface WidgetUi {
  setWidget(key: string, lines: string[] | undefined): void;
}

export interface WidgetTheme {
  fg(kind: string, s: string): string;
  bold(s: string): string;
}

export interface Widget {
  setTitle(content: string | (() => string)): void;
  setBody(content: string[] | (() => string[])): void;
  setFooter(content: string | (() => string)): void;
  invalidate(): void;
  readonly subagents: ReadonlyArray<SubagentSlot>;
  elapsedMs(): number;
  readonly theme?: WidgetTheme;
  dispose(): void;

  // Internal seam for the framework: drive subagent slots from lifecycle events
  _emitSubagentLifecycle(
    ev:
      | { kind: "start"; id: number; intent: string }
      | { kind: "event"; id: number; event: ToolEvent }
      | { kind: "end"; id: number },
  ): void;
}

export interface CreateWidgetOpts {
  key: string;
  ui: WidgetUi;
  theme?: WidgetTheme;
  now?: () => number;
  tickMs?: number;
  maxRecentEventsPerSlot?: number;
}

export function createWidget(opts: CreateWidgetOpts): Widget {
  const now = opts.now ?? Date.now;
  const tickMs = opts.tickMs ?? 1000;
  const maxK = opts.maxRecentEventsPerSlot ?? 3;
  const startedAt = now();
  let title: string | (() => string) = "";
  let body: string[] | (() => string[]) = [];
  let footer: string | (() => string) = "";
  const slots = new Map<number, { slot: SubagentSlot; events: ToolEvent[] }>();
  const tick = setInterval(() => render(), tickMs);

  function visibleSubagents(): SubagentSlot[] {
    return [...slots.values()].map((s) => s.slot);
  }

  function evalContent<T>(c: T | (() => T)): T {
    return typeof c === "function" ? (c as () => T)() : c;
  }

  function render(): void {
    const t = evalContent<string>(title as any);
    const b = evalContent<string[]>(body as any);
    const f = evalContent<string>(footer as any);
    const lines: string[] = [];
    if (t) lines.push(t);
    lines.push(...b);
    if (f) lines.push(f);
    opts.ui.setWidget(opts.key, lines);
  }

  return {
    setTitle(c) {
      title = c;
      render();
    },
    setBody(c) {
      body = c;
      render();
    },
    setFooter(c) {
      footer = c;
      render();
    },
    invalidate() {
      render();
    },
    get subagents() {
      return visibleSubagents();
    },
    elapsedMs() {
      return now() - startedAt;
    },
    theme: opts.theme,
    dispose() {
      clearInterval(tick);
      opts.ui.setWidget(opts.key, undefined);
    },
    _emitSubagentLifecycle(ev) {
      if (ev.kind === "start") {
        slots.set(ev.id, {
          slot: {
            id: ev.id,
            intent: ev.intent,
            startedAt: now(),
            recentEvents: [],
            status: "running",
          },
          events: [],
        });
      } else if (ev.kind === "event") {
        const entry = slots.get(ev.id);
        if (!entry) return;
        entry.events.push(ev.event);
        if (entry.events.length > maxK)
          entry.events.splice(0, entry.events.length - maxK);
        entry.slot = { ...entry.slot, recentEvents: [...entry.events] };
      } else {
        const entry = slots.get(ev.id);
        if (!entry) return;
        entry.slot = { ...entry.slot, status: "finished" };
      }
      render();
    },
  };
}
