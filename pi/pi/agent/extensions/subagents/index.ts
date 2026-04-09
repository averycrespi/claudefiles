import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import {
  buildSpawnAgentParams,
  buildSpawnAgentsParams,
  type AgentDefinition,
  type SpawnAgentItem,
  type SpawnAgentParams,
  type SpawnAgentsParams,
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
  return `…${trimmed.slice(-max)}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${totalSeconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
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

function clearRenderTimer(state: Record<string, unknown>): void {
  const handle = state.renderTimer;
  if (handle && typeof handle === "object") {
    clearInterval(handle as ReturnType<typeof setInterval>);
  }
  state.renderTimer = undefined;
}

function buildAgentDescription(agents: AgentDefinition[]): string {
  if (agents.length === 0) {
    return 'Agent type. No agents are currently loaded — check that agent markdown files exist in ~/.pi/agent/agents/.';
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
  const t =
    (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const intent =
    typeof args.intent === "string" ? normalizeIntent(args.intent) : "";
  t.setText(
    theme.fg("toolTitle", theme.bold(`${label} `)) + theme.fg("muted", intent),
  );
  return t;
}

function renderAgentResult(
  result: { content: { type: string; text?: string }[]; details?: unknown },
  options: { isPartial: boolean },
  theme: any,
  context: any,
) {
  const t =
    (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const activity = getActivity(result.details);
  const state = context.state as Record<string, unknown>;
  const showActivity = context.args?.show_activity ?? true;

  if (options.isPartial && showActivity) {
    if (!state.renderTimer) {
      state.renderTimer = setInterval(() => context.invalidate(), 1_000);
    }
  } else {
    clearRenderTimer(state);
  }

  if (options.isPartial) {
    const command = activity?.currentCommand ?? activity?.lastCommand;
    const elapsed = activity
      ? formatDuration(Date.now() - activity.startedAt)
      : undefined;
    const lines = [theme.fg("warning", "Running...")];
    if (command) {
      lines.push(
        theme.fg("muted", "command:") +
          " " +
          theme.fg("toolOutput", truncate(command)),
      );
    }
    if (elapsed) {
      lines.push(
        theme.fg("muted", "running:") + " " + theme.fg("toolOutput", elapsed),
      );
    }
    t.setText(lines.join("\n"));
    return t;
  }

  const firstText = result.content.find(
    (item): item is { type: "text"; text: string } =>
      item.type === "text" && typeof item.text === "string",
  );
  const summary = firstText?.text?.trim();

  if (context.isError || summary?.startsWith("Error:")) {
    t.setText(theme.fg("error", summary || "Error: subagent failed"));
    return t;
  }

  const elapsed = activity
    ? formatDuration(Math.max(0, activity.lastUpdateAt - activity.startedAt))
    : undefined;
  t.setText(
    elapsed
      ? theme.fg("success", `✓ Done in ${elapsed}`)
      : theme.fg("success", "✓ Done"),
  );
  return t;
}

// ─── spawn_agents rendering ───────────────────────────────────────────────────

function renderAgentsCall(
  args: { agents?: unknown[] },
  theme: any,
  context: any,
) {
  const t =
    (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
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

function renderAgentsResult(
  result: { content: { type: string; text?: string }[]; details?: unknown },
  options: { isPartial: boolean },
  theme: any,
  context: any,
) {
  const t =
    (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const state = context.state as Record<string, unknown>;
  const d = (result.details ?? {}) as {
    agents?: SubagentRunState[];
    total?: number;
    failed?: number;
  };

  if (options.isPartial) {
    if (!state.renderTimer) {
      state.renderTimer = setInterval(() => context.invalidate(), 1_000);
    }
    const lines = [
      theme.fg("warning", `Running ${d.total ?? "?"} agents...`),
    ];
    for (const agent of d.agents ?? []) {
      const cmd = agent.currentCommand ?? agent.lastCommand ?? agent.phase;
      const elapsed = formatDuration(Date.now() - agent.startedAt);
      const isDone = agent.phase === "done";
      const isError =
        agent.phase === "error" || agent.phase === "aborted";
      const bullet = isDone ? "✓" : isError ? "✗" : "·";
      const color = isDone ? "success" : isError ? "error" : "warning";
      lines.push(
        `  ${theme.fg(color, bullet)} ${theme.fg("muted", agent.intent + ":")} ${theme.fg("toolOutput", truncate(cmd, 60))} ${theme.fg("muted", `(${elapsed})`)}`,
      );
    }
    t.setText(lines.join("\n"));
    return t;
  }

  clearRenderTimer(state);

  const total = d.total ?? 1;
  const failed = d.failed ?? 0;

  if (context.isError || failed > 0) {
    t.setText(theme.fg("error", `✗ ${failed} of ${total} agents failed`));
    return t;
  }

  const maxElapsed = (d.agents ?? []).reduce(
    (max, a) => Math.max(max, a.lastUpdateAt - a.startedAt),
    0,
  );
  t.setText(
    theme.fg(
      "success",
      `✓ ${total} agent${total === 1 ? "" : "s"} done in ${formatDuration(maxElapsed)}`,
    ),
  );
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
    roleLabel: agent.name.charAt(0).toUpperCase() + agent.name.slice(1) + " agent",
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
    phase: "starting",
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
    specs.map((spec, i) => {
      const agent = agentMap.get(spec.agent);
      if (!agent) {
        return Promise.resolve({
          content: text(`Error: unknown agent type "${spec.agent}"`),
          details: { exitCode: 1, aborted: false },
        });
      }
      return runSpawn(
        pi,
        agent,
        normalizeIntent(spec.intent),
        spec.prompt,
        true,
        ctx,
        `${toolCallId}:${i}`,
        (event) => {
          const activity = getActivity(event.details);
          if (activity) states[i] = activity;
          emitCombined();
        },
      );
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
    const agentList = agents.map((a) => `${a.name}: ${a.description}`).join("; ");
    const guidance = `\n\n## Subagent delegation\nUse spawn_agent to delegate tasks to a focused subagent when a task would generate large output, require iterative searching, or benefit from isolation. Use spawn_agents when multiple independent tasks can run concurrently — pass all agents in one call rather than sequential calls. Brief each agent thoroughly — subagents have no access to the current conversation. Available agent types: ${agentList}.`;
    return { systemPrompt: event.systemPrompt + guidance };
  });

  pi.registerTool({
    name: "spawn_agent",
    label: "Spawn Agent",
    description:
      "Launch a subagent to handle a task autonomously in its own context window. Brief the agent like a colleague who just walked in — provide all necessary context in the prompt.",
    parameters: buildSpawnAgentParams(agentDescription),
    async execute(
      toolCallId,
      params: SpawnAgentParams,
      signal,
      onUpdate,
      ctx,
    ) {
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
      const agentName =
        typeof args.agent === "string" ? args.agent : undefined;
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
      return renderAgentsCall(
        args as { agents?: unknown[] },
        theme,
        context,
      );
    },
    renderResult(result, options, theme, context) {
      return renderAgentsResult(result, options, theme, context);
    },
  });
}
