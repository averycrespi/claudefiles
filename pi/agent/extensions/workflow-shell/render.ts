import type { WorkflowMode } from "./types.ts";

export function renderWorkflowWidget(options: {
  mode: WorkflowMode;
  activePlanPath?: string;
  focus?: string;
}): string[] | undefined {
  if (options.mode === "normal" || !options.activePlanPath) return undefined;

  const focus = options.focus?.trim();
  const line = [
    "workflow",
    options.mode,
    options.activePlanPath,
    focus && focus.length > 0 ? truncate(focus, 60) : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return [line];
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
