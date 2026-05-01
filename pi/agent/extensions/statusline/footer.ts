import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { formatDuration, type UsageStats } from "./utils.ts";

export type FooterTheme = {
  fg(color: string, text: string): string;
  bold(text: string): string;
};

export type FooterState = {
  cwd: string;
  homeDir?: string;
  usage?: {
    label: string;
    stats: UsageStats;
  };
  contextUsage?: {
    percent: number | null;
    contextWindow: number | null;
  } | null;
  modelId?: string;
  thinking?: string;
};

function collapseHome(cwd: string, homeDir?: string): string {
  if (homeDir && cwd.startsWith(homeDir)) {
    return `~${cwd.slice(homeDir.length)}`;
  }
  return cwd;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions.toFixed(millions >= 10 ? 0 : 1)}m`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(value);
}

function colorizePercent(percent: number, theme: FooterTheme): string {
  const text = `${Math.round(percent)}%`;
  if (percent > 90) return theme.fg("error", text);
  if (percent > 70) return theme.fg("warning", text);
  return text;
}

function buildUsageSegment(
  usage: FooterState["usage"],
  theme: FooterTheme,
): string | undefined {
  if (!usage) return undefined;

  const { label, stats } = usage;
  if (stats.balance !== undefined) {
    const reset = stats.primary?.resetAfterSeconds;
    return reset === undefined
      ? `${label} $${stats.balance}`
      : `${label} $${stats.balance} ↺${formatDuration(reset)}`;
  }

  if (stats.limitReached) {
    const reset = stats.primary?.resetAfterSeconds;
    return reset === undefined
      ? `${label} limit`
      : `${label} limit ↺${formatDuration(reset)}`;
  }

  const primaryPercent = stats.primary?.usedPercent;
  const secondaryPercent = stats.secondary?.usedPercent;
  const primaryReset = stats.primary?.resetAfterSeconds;
  const secondaryReset = stats.secondary?.resetAfterSeconds;

  if (primaryPercent === undefined && secondaryPercent === undefined) {
    return label;
  }

  let percentText = "";
  if (primaryPercent !== undefined && secondaryPercent !== undefined) {
    percentText = `${colorizePercent(primaryPercent, theme)} (${colorizePercent(secondaryPercent, theme)})`;
  } else if (primaryPercent !== undefined) {
    percentText = colorizePercent(primaryPercent, theme);
  } else if (secondaryPercent !== undefined) {
    percentText = colorizePercent(secondaryPercent, theme);
  }

  let resetText = "";
  if (primaryReset !== undefined && secondaryReset !== undefined) {
    resetText = ` ↺${formatDuration(primaryReset)}/${formatDuration(secondaryReset)}`;
  } else if (primaryReset !== undefined) {
    resetText = ` ↺${formatDuration(primaryReset)}`;
  } else if (secondaryReset !== undefined) {
    resetText = ` ↺${formatDuration(secondaryReset)}`;
  }

  return `${label} ${percentText}${resetText}`;
}

function buildContextSegment(
  contextUsage: FooterState["contextUsage"],
  theme: FooterTheme,
): string | undefined {
  if (!contextUsage?.contextWindow) return undefined;

  const percent = contextUsage.percent;
  const percentText =
    percent === null || percent === undefined
      ? "?%"
      : colorizePercent(percent, theme);

  return `ctx ${percentText}/${formatTokens(contextUsage.contextWindow)}`;
}

export function renderFooterLine(
  state: FooterState,
  width: number,
  theme: FooterTheme,
): string {
  if (width <= 0) return "";

  const separator = theme.fg("dim", " · ");
  const segments = [
    collapseHome(state.cwd, state.homeDir),
    buildUsageSegment(state.usage, theme),
    buildContextSegment(state.contextUsage, theme),
    state.modelId,
    state.thinking,
  ].filter((segment): segment is string => Boolean(segment));

  let line = "";
  for (const segment of segments) {
    const candidate = line ? `${line}${separator}${segment}` : segment;
    if (visibleWidth(candidate) <= width) {
      line = candidate;
      continue;
    }

    if (!line) return truncateToWidth(segment, width);
    break;
  }

  return line;
}
