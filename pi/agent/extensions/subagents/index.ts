import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import {
  clearPartialTimer,
  formatDuration,
  startPartialTimer,
} from "../_shared/render.js";
import {
  buildSpawnAgentParams,
  buildSpawnAgentsParams,
  type AgentDefinition,
  type SpawnAgentItem,
  type SpawnAgentParams,
  type SpawnAgentsParams,
  type SubagentEvent,
  type SubagentRunState,
} from "./types.js";
import {
  createSubagentActivityTracker,
  type SubagentActivityTracker,
} from "./activity.js";
import { formatSpawnFailure, spawnSubagent } from "./spawn.js";
import { loadAgents } from "./loader.js";

const text = (value: string) => [{ type: "text" as const, text: value }];

function modelSelectorFromCtx(ctx: {
  model?: { provider?: string; id?: string };
}) {
  if (!ctx.model?.provider || !ctx.model.id) return undefined;
  return `${ctx.model.provider}/${ctx.model.id}`;
}

function thinkingLevelFromPi(pi: ExtensionAPI): string | undefined {
  try {
    const level = pi.getThinkingLevel();
    return level && level !== "off" ? level : undefined;
  } catch {
    return undefined;
  }
}

function normalizeIntent(intent: string): string {
  const trimmed = intent.trim();
  if (!trimmed) throw new Error("intent is required");
  return trimmed;
}

function truncate(str: string, max = 120): string {
  const trimmed = str.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function renderEventLine(event: SubagentEvent, sp: string, theme: any): string {
  if (event.kind === "stderr") {
    return `${sp}${theme.fg("error", `stderr: ${event.text}`)}`;
  }
  return `${sp}${theme.fg("muted", event.text)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function getActivity(details: unknown): SubagentRunState | undefined {
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

function buildAgentDescription(agents: AgentDefinition[]): string {
  if (agents.length === 0) {
    return "Agent type. No agents are currently loaded — check that agent markdown files exist in ~/.pi/agent/agents/.";
  }
  const list = agents.map((a) => `- ${a.name}: ${a.description}`).join("\n");
  return `Agent type. Choose based on the task:\n\n${list}`;
}

// ─── spawn_agent rendering ────────────────────────────────────────────────────

function renderAgentCall(
  label: string,
  args: { intent?: string },
  theme: any,
  context: any,
) {
  const t = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const intent =
    typeof args.intent === "string" ? normalizeIntent(args.intent) : "";
  t.setText(
    theme.fg("toolTitle", theme.bold(`${label} `)) + theme.fg("muted", intent),
  );
  return t;
}

function statsLine(
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

function renderAgentResult(
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

  const sp = theme.fg("muted", "⎿  ");

  if (options.isPartial) {
    const events = activity?.recentEvents ?? [];
    const lines: string[] = [];
    if (events.length > 0) {
      for (const event of events) {
        lines.push(renderEventLine(event, sp, theme));
      }
    } else {
      lines.push(`${sp}${theme.fg("muted", "Initializing...")}`);
    }
    lines.push(`${sp}${theme.fg("muted", formatRunningLine(activity))}`);
    t.setText(lines.join("\n"));
    return t;
  }

  const firstText = result.content.find(
    (item): item is { type: "text"; text: string } =>
      item.type === "text" && typeof item.text === "string",
  );
  const summary = firstText?.text?.trim();

  if (context.isError || summary?.startsWith("Error:")) {
    t.setText(`${sp}${theme.fg("error", summary || "Error: subagent failed")}`);
    return t;
  }

  const doneStats = activity
    ? statsLine(
        activity.toolUseCount,
        activity.totalTokens,
        Math.max(0, activity.lastUpdateAt - activity.startedAt),
      )
    : "";
  const doneLine = doneStats ? `done: ${doneStats}` : "done";
  t.setText(`${sp}${theme.fg("muted", doneLine)}`);
  return t;
}

// ─── spawn_agents rendering ───────────────────────────────────────────────────

function renderAgentsCall(
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
  isLast: boolean,
  theme: any,
): string {
  const isResolved = agent.resolved === true;
  const treeChar = isLast ? "└─" : "├─";
  const sp = isLast ? "   ⎿  " : "│  ⎿  ";
  const typeName = agent.agentType ?? "agent";
  const typeLabel = typeName.charAt(0).toUpperCase() + typeName.slice(1);
  const nameLine = `${theme.fg("muted", treeChar)} ${theme.bold(typeLabel)}${theme.fg("muted", `: ${agent.intent}`)}`;

  if (isResolved) {
    const doneInfo = statsLine(
      agent.toolUseCount,
      agent.totalTokens,
      Math.max(0, agent.lastUpdateAt - agent.startedAt),
    );
    const doneLine = doneInfo ? `done: ${doneInfo}` : "done";
    return `${nameLine}\n${theme.fg("muted", sp)}${theme.fg("muted", doneLine)}`;
  }

  const events = agent.recentEvents ?? [];
  const lastEvent = events[events.length - 1];
  const toolInfoLine = lastEvent
    ? renderEventLine(lastEvent, theme.fg("muted", sp), theme)
    : `${theme.fg("muted", sp)}${theme.fg("muted", "Initializing...")}`;
  const runningLine = formatRunningLine(agent);
  return [
    nameLine,
    toolInfoLine,
    `${theme.fg("muted", sp)}${theme.fg("muted", runningLine)}`,
  ].join("\n");
}

/**
 * Build the per-agent running line. Format:
 *   "Running: 3 tool uses (1m 03s)"  when there are tool uses
 *   "Running... (1m 03s)"            before the first tool use
 *   "Running..."                     when no activity is known yet
 */
function formatRunningLine(agent: SubagentRunState | undefined): string {
  if (!agent) return "Running...";
  const elapsedSuffix = ` (${formatDuration(Date.now() - agent.startedAt)})`;
  const toolUses = agent.toolUseCount;
  if (toolUses > 0) {
    const label = toolUses === 1 ? "1 tool use" : `${toolUses} tool uses`;
    return `Running: ${label}${elapsedSuffix}`;
  }
  return `Running...${elapsedSuffix}`;
}

function renderAgentsResult(
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
    t.setText(lines.join("\n"));
    return t;
  }

  clearPartialTimer(context);

  const agents = d.agents ?? [];
  const failed = d.failed ?? 0;

  if (context.isError || failed > 0) {
    const total = d.total ?? 1;
    const header = theme.fg("error", `${failed} of ${total} agents failed`);
    const lines = [header];
    for (let i = 0; i < agents.length; i++) {
      lines.push(agentProgressLine(agents[i], i === agents.length - 1, theme));
    }
    t.setText(lines.join("\n"));
    return t;
  }

  const lines: string[] = [];
  for (let i = 0; i < agents.length; i++) {
    lines.push(agentProgressLine(agents[i], i === agents.length - 1, theme));
  }
  t.setText(lines.join("\n"));
  return t;
}

// ─── execution ────────────────────────────────────────────────────────────────

type SpawnCtx = {
  cwd: string;
  signal?: AbortSignal;
  model?: { provider?: string; id?: string };
  sessionManager: { getSessionFile(): string | undefined };
  hasUI: boolean;
  ui: {
    setStatus(widgetId: string, text: string | undefined): void;
    setWidget(widgetId: string, widget: string[] | undefined): void;
  };
};

type OnUpdate = (event: {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}) => void;

async function runSpawn(
  pi: ExtensionAPI,
  agent: AgentDefinition,
  intent: string,
  prompt: string,
  showActivity: boolean,
  ctx: SpawnCtx,
  toolCallId: string,
  onUpdate?: OnUpdate,
): Promise<{
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}> {
  const tracker: SubagentActivityTracker = createSubagentActivityTracker({
    toolCallId,
    roleLabel:
      agent.name.charAt(0).toUpperCase() + agent.name.slice(1) + " agent",
    intent,
    showActivity,
    hasUI: ctx.hasUI,
    ui: ctx.hasUI
      ? {
          setStatus: (id, value) => ctx.ui.setStatus(id, value),
          setWidget: (id, value) => ctx.ui.setWidget(id, value),
        }
      : undefined,
    onUpdate,
  });

  const result = await spawnSubagent({
    prompt,
    toolAllowlist: agent.tools,
    extensionAllowlist: agent.extensions,
    model: agent.model ?? modelSelectorFromCtx(ctx),
    thinking: agent.thinking ?? thinkingLevelFromPi(pi),
    systemPrompt: agent.systemPrompt,
    inheritSession: "none",
    parentSessionFile: ctx.sessionManager.getSessionFile(),
    disableSkills: agent.disableSkills,
    disablePromptTemplates: agent.disablePromptTemplates,
    logId: toolCallId,
    cwd: ctx.cwd,
    signal: ctx.signal,
    onEvent: (event) => tracker.handleEvent(event),
  });

  tracker.finish(result);

  if (!result.ok) {
    return {
      content: text(formatSpawnFailure(result)),
      details: {
        aborted: result.aborted,
        exitCode: result.exitCode,
        signal: result.signal,
        stderr: result.stderr,
        stdout: result.stdout,
        logFile: result.logFile,
        activity: tracker.state,
      },
    };
  }

  return {
    content: text(result.stdout),
    details: {
      exitCode: result.exitCode,
      activity: tracker.state,
    },
  };
}

async function runParallelSpawn(
  pi: ExtensionAPI,
  specs: SpawnAgentItem[],
  agentMap: Map<string, AgentDefinition>,
  ctx: SpawnCtx,
  toolCallId: string,
  onUpdate?: OnUpdate,
): Promise<{
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
}> {
  const states: SubagentRunState[] = specs.map((s) => ({
    intent: s.intent,
    agentType: s.agent,
    phase: "starting",
    recentEvents: [],
    toolUseCount: 0,
    totalTokens: 0,
    startedAt: Date.now(),
    lastUpdateAt: Date.now(),
  }));

  function emitCombined(): void {
    onUpdate?.({
      content: [{ type: "text", text: `Running ${specs.length} agents...` }],
      details: { agents: [...states], total: specs.length },
    });
  }

  const results = await Promise.all(
    specs.map(async (spec, i) => {
      const agent = agentMap.get(spec.agent);
      if (!agent) {
        states[i].resolved = true;
        emitCombined();
        return {
          content: text(`Error: unknown agent type "${spec.agent}"`),
          details: { exitCode: 1, aborted: false },
        };
      }
      const result = await runSpawn(
        pi,
        agent,
        normalizeIntent(spec.intent),
        spec.prompt,
        true,
        ctx,
        `${toolCallId}:${i}`,
        (event) => {
          const activity = getActivity(event.details);
          if (activity) {
            activity.agentType = spec.agent;
            states[i] = activity;
          }
          emitCombined();
        },
      );
      states[i].resolved = true;
      emitCombined();
      return result;
    }),
  );

  const failed = results.filter((r) => {
    const ec = r.details.exitCode;
    return (typeof ec === "number" && ec !== 0) || r.details.aborted === true;
  }).length;

  const parts = results.map((r, i) => {
    const header = `## ${specs[i].agent} · ${specs[i].intent}`;
    const body = r.content[0]?.text ?? "";
    return `${header}\n\n${body}`;
  });

  return {
    content: text(parts.join("\n\n---\n\n")),
    details: {
      agents: states,
      total: specs.length,
      failed,
      allOk: failed === 0,
    },
  };
}

// ─── extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const agents = loadAgents();
  const agentMap = new Map(agents.map((a) => [a.name, a]));
  const agentDescription = buildAgentDescription(agents);

  pi.on("before_agent_start", async (event: { systemPrompt: string }) => {
    const agentList = agents
      .map((a) => `${a.name}: ${a.description}`)
      .join("; ");
    const guidance = `\n\n## Subagent delegation\nUse spawn_agent to delegate tasks to a focused subagent when a task would generate large output, require iterative searching, or benefit from isolation. Use spawn_agents when multiple independent tasks can run concurrently — pass all agents in one call rather than sequential calls. Brief each agent thoroughly — subagents have no access to the current conversation. Available agent types: ${agentList}.`;
    return { systemPrompt: event.systemPrompt + guidance };
  });

  pi.registerTool({
    name: "spawn_agent",
    label: "Spawn Agent",
    description:
      "Launch a subagent to handle a task autonomously in its own context window. Brief the agent like a colleague who just walked in — provide all necessary context in the prompt.",
    parameters: buildSpawnAgentParams(agentDescription),
    async execute(toolCallId, params: SpawnAgentParams, signal, onUpdate, ctx) {
      const agent = agentMap.get(params.agent);
      if (!agent) {
        return {
          content: text(
            `Error: unknown agent type "${params.agent}". Available types: ${agents.map((a) => a.name).join(", ")}`,
          ),
          details: {},
        };
      }
      return await runSpawn(
        pi,
        agent,
        normalizeIntent(params.intent),
        params.prompt,
        params.show_activity ?? true,
        {
          cwd: ctx.cwd,
          signal,
          model: ctx.model as any,
          sessionManager: ctx.sessionManager,
          hasUI: ctx.hasUI,
          ui: ctx.ui,
        },
        toolCallId,
        onUpdate,
      );
    },
    renderCall(args, theme, context) {
      const agentName = typeof args.agent === "string" ? args.agent : undefined;
      const label = agentName
        ? agentName.charAt(0).toUpperCase() + agentName.slice(1) + " agent"
        : "Subagent";
      return renderAgentCall(label, args, theme, context);
    },
    renderResult(result, options, theme, context) {
      return renderAgentResult(result, options, theme, context);
    },
  });

  pi.registerTool({
    name: "spawn_agents",
    label: "Spawn Agents",
    description:
      "Launch multiple subagents in parallel. Each runs independently in its own context window. Results are returned as a combined document once all complete. Use when tasks are independent and can run concurrently.",
    parameters: buildSpawnAgentsParams(agentDescription),
    async execute(
      toolCallId,
      params: SpawnAgentsParams,
      signal,
      onUpdate,
      ctx,
    ) {
      return await runParallelSpawn(
        pi,
        params.agents,
        agentMap,
        {
          cwd: ctx.cwd,
          signal,
          model: ctx.model as any,
          sessionManager: ctx.sessionManager,
          hasUI: ctx.hasUI,
          ui: ctx.ui,
        },
        toolCallId,
        onUpdate,
      );
    },
    renderCall(args, theme, context) {
      return renderAgentsCall(args as { agents?: unknown[] }, theme, context);
    },
    renderResult(result, options, theme, context) {
      return renderAgentsResult(result, options, theme, context);
    },
  });
}
