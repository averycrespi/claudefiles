import { truncateToWidth } from "@mariozechner/pi-tui";
import type { WorkflowMode } from "./types.ts";

const WIDGET_SEPARATOR = "─";

const plainTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

type WidgetTheme = typeof plainTheme;

export function renderWorkflowWidgetLines(
  options: {
    mode: WorkflowMode;
    activePlanPath?: string;
    focus?: string;
  },
  width: number,
  theme: WidgetTheme = plainTheme,
): string[] {
  if (options.mode === "normal" || !options.activePlanPath) return [];

  const safeWidth = Math.max(0, width);
  const focus = options.focus?.trim();
  const line = [
    "workflow",
    options.mode,
    options.activePlanPath,
    focus && focus.length > 0 ? truncate(focus, 60) : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return [
    theme.fg("borderMuted", WIDGET_SEPARATOR.repeat(safeWidth)),
    truncateToWidth(line, safeWidth),
  ];
}

export function createWorkflowWidget(options: {
  mode: WorkflowMode;
  activePlanPath?: string;
  focus?: string;
}) {
  return (_tui: unknown, theme: WidgetTheme) => ({
    render(width: number) {
      return renderWorkflowWidgetLines(options, width, theme);
    },
    invalidate() {},
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
