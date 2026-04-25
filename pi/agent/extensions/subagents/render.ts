/**
 * TUI rendering for the subagents extension.
 *
 * Pure formatters (`formatTokens`, `statsLine`, `formatRunningLine`,
 * `getActivity`) are unit-tested in `render.test.ts`. The render
 * functions themselves return pi-tui `Text` components and are exercised
 * indirectly via the extension's tool registrations in `index.ts`.
 */

import { Text } from "@mariozechner/pi-tui";
import {
  clearPartialTimer,
  firstLine,
  formatDuration,
  startPartialTimer,
} from "../_shared/render.ts";
import type { SubagentEvent, SubagentRunState } from "./types.ts";

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export function getActivity(details: unknown): SubagentRunState | undefined {
  if (!details || typeof details !== "object") return undefined;
  const record = details as Record<string, unknown>;
  const activity = record.activity;
  if (activity && typeof activity === "object") {
    return activity as SubagentRunState;
  }
  if (
    typeof record.intent === "string" &&
    typeof record.phase === "string" &&
    typeof record.startedAt === "number" &&
    typeof record.lastUpdateAt === "number"
  ) {
    return record as unknown as SubagentRunState;
  }
  return undefined;
}

export function statsLine(
  toolUseCount: number,
  totalTokens: number,
  durationMs: number,
): string {
  const parts: string[] = [];
  if (toolUseCount > 0) {
    parts.push(`${toolUseCount} tool ${toolUseCount === 1 ? "use" : "uses"}`);
  }
  if (totalTokens > 0) {
    parts.push(`${formatTokens(totalTokens)} tokens`);
  }
  parts.push(formatDuration(durationMs));
  return parts.join(" · ");
}

/**
 * Build the per-agent running line. Format:
 *   "Running: 3 tool uses (1m 03s)"  when there are tool uses
 *   "Running... (1m 03s)"            before the first tool use
 *   "Running..."                     when no activity is known yet
 */
export function formatRunningLine(agent: SubagentRunState | undefined): string {
  if (!agent) return "Running...";
  const elapsedSuffix = ` (${formatDuration(Date.now() - agent.startedAt)})`;
  const toolUses = agent.toolUseCount;
  if (toolUses > 0) {
    const label = toolUses === 1 ? "1 tool use" : `${toolUses} tool uses`;
    return `Running: ${label}${elapsedSuffix}`;
  }
  return `Running...${elapsedSuffix}`;
}

function renderEventLine(
  event: SubagentEvent,
  prefix: string,
  theme: any,
): string {
  if (event.kind === "stderr") {
    return `${prefix}${theme.fg("error", `stderr: ${event.text}`)}`;
  }
  return `${prefix}${theme.fg("muted", event.text)}`;
}

// ─── spawn_agent rendering ────────────────────────────────────────────────────

export function renderAgentCall(
  args: { agent?: string; intent?: string },
  theme: any,
  context: any,
) {
  const t = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const agentName = typeof args.agent === "string" ? args.agent : undefined;
  const label = agentName
    ? agentName.charAt(0).toUpperCase() + agentName.slice(1) + " agent"
    : "Subagent";
  // Lenient form of normalizeIntent for rendering — renderCall can fire
  // with partial args while the LLM is still streaming, so an empty
  // intent must render as "" rather than throw.
  const intent = typeof args.intent === "string" ? args.intent.trim() : "";
  t.setText(
    theme.fg("toolTitle", theme.bold(`${label} `)) + theme.fg("muted", intent),
  );
  return t;
}

export function renderAgentResult(
  result: { content: { type: string; text?: string }[]; details?: unknown },
  options: { isPartial: boolean },
  theme: any,
  context: any,
) {
  const t = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const activity = getActivity(result.details);
  const showActivity = context.args?.show_activity ?? true;

  if (options.isPartial && showActivity) {
    startPartialTimer(context);
  } else {
    clearPartialTimer(context);
  }

  if (options.isPartial) {
    const events = activity?.recentEvents ?? [];
    if (events.length > 0) {
      const lines: string[] = [];
      for (const event of events) {
        lines.push(renderEventLine(event, "- ", theme));
      }
      lines.push(theme.fg("muted", formatRunningLine(activity)));
      t.setText(lines.join("\n"));
    } else {
      const elapsed = activity
        ? ` (${formatDuration(Date.now() - activity.startedAt)})`
        : "";
      t.setText(theme.fg("muted", `Initializing...${elapsed}`));
    }
    return t;
  }

  const firstText = result.content.find(
    (item): item is { type: "text"; text: string } =>
      item.type === "text" && typeof item.text === "string",
  );
  const summary = firstText?.text?.trim();

  if (context.isError || summary?.startsWith("Error:")) {
    const errorMsg = activity?.errorMessage
      ? `Error: ${activity.errorMessage}`
      : firstLine(summary || "Error: subagent failed");
    const lines = [theme.fg("error", errorMsg)];
    if (activity?.logFile) {
      lines.push(theme.fg("muted", `Log: ${activity.logFile}`));
    }
    t.setText(lines.join("\n"));
    return t;
  }

  const doneStats = activity
    ? statsLine(
        activity.toolUseCount,
        activity.totalTokens,
        Math.max(0, activity.lastUpdateAt - activity.startedAt),
      )
    : "";
  const doneLine = doneStats ? `Done: ${doneStats}` : "Done";
  t.setText(theme.fg("muted", doneLine));
  return t;
}

// ─── spawn_agents rendering ───────────────────────────────────────────────────

export function renderAgentsCall(
  args: { agents?: unknown[] },
  theme: any,
  context: any,
) {
  const t = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const agents = Array.isArray(args.agents) ? args.agents : [];
  const intents = agents
    .map((a: any) => (typeof a?.intent === "string" ? a.intent.trim() : ""))
    .filter(Boolean);
  const label =
    intents.length > 0
      ? intents.slice(0, 3).join(", ") +
        (intents.length > 3 ? `, +${intents.length - 3} more` : "")
      : `${agents.length} agents`;
  t.setText(
    theme.fg("toolTitle", theme.bold("Spawn agents ")) +
      theme.fg("muted", label),
  );
  return t;
}

function agentProgressLine(
  agent: SubagentRunState,
  _isLast: boolean,
  theme: any,
): string {
  const isResolved = agent.resolved === true;
  const typeName = agent.agentType ?? "agent";
  const typeLabel = typeName.charAt(0).toUpperCase() + typeName.slice(1);
  const nameLine = `${theme.bold(`${typeLabel} agent`)} ${theme.fg("muted", agent.intent)}`;

  if (isResolved) {
    if (agent.phase === "aborted" || agent.phase === "error") {
      const msg = agent.errorMessage
        ? firstLine(agent.errorMessage)
        : agent.phase === "aborted"
          ? "Error: subagent aborted"
          : "Error: subagent failed";
      const lines = [nameLine, theme.fg("error", msg)];
      if (agent.logFile) {
        lines.push(theme.fg("muted", `Log: ${agent.logFile}`));
      }
      return lines.join("\n");
    }
    const doneInfo = statsLine(
      agent.toolUseCount,
      agent.totalTokens,
      Math.max(0, agent.lastUpdateAt - agent.startedAt),
    );
    const doneLine = doneInfo ? `Done: ${doneInfo}` : "Done";
    return `${nameLine}\n${theme.fg("muted", doneLine)}`;
  }

  const events = agent.recentEvents ?? [];
  const lastEvent = events[events.length - 1];
  if (lastEvent) {
    const runningLine = formatRunningLine(agent);
    return [
      nameLine,
      renderEventLine(lastEvent, "- ", theme),
      theme.fg("muted", runningLine),
    ].join("\n");
  }
  const elapsed = ` (${formatDuration(Date.now() - agent.startedAt)})`;
  return `${nameLine}\n${theme.fg("muted", `Initializing...${elapsed}`)}`;
}

export function renderAgentsResult(
  result: { content: { type: string; text?: string }[]; details?: unknown },
  options: { isPartial: boolean },
  theme: any,
  context: any,
) {
  const t = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const d = (result.details ?? {}) as {
    agents?: SubagentRunState[];
    total?: number;
    failed?: number;
  };

  if (options.isPartial) {
    startPartialTimer(context);
    const agents = d.agents ?? [];
    const lines: string[] = [];
    for (let i = 0; i < agents.length; i++) {
      lines.push(agentProgressLine(agents[i], i === agents.length - 1, theme));
    }
    t.setText("\n" + lines.join("\n\n"));
    return t;
  }

  clearPartialTimer(context);

  const agents = d.agents ?? [];

  const lines: string[] = [];
  for (let i = 0; i < agents.length; i++) {
    lines.push(agentProgressLine(agents[i], i === agents.length - 1, theme));
  }
  t.setText("\n" + lines.join("\n\n"));
  return t;
}
