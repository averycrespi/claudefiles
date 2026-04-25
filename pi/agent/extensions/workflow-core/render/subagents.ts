import { renderClock } from "./clock.ts";
import type { SubagentSlot } from "../lib/types.ts";

export interface RenderSubagentsTheme {
  fg(kind: string, s: string): string;
}

export interface RenderSubagentsOpts {
  theme?: RenderSubagentsTheme;
  now?: () => number;
}

export function renderSubagents(
  slots: ReadonlyArray<SubagentSlot>,
  opts: RenderSubagentsOpts = {},
): string[] {
  const now = opts.now ?? Date.now;
  const lines: string[] = [];
  for (const s of slots) {
    if (s.status !== "running") continue;
    const elapsed = now() - s.startedAt;
    lines.push(`↳ ${s.intent} (${renderClock(elapsed)})`);
  }
  return lines;
}
