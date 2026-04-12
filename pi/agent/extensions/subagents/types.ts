import { Type } from "@sinclair/typebox";

export const BUILTIN_TOOLS = ["read", "bash", "edit", "write"] as const;

export const MAX_SUBAGENT_DEPTH = 5;

export type BuiltinTool = (typeof BUILTIN_TOOLS)[number];
export type InheritSession = "none" | "fork";
export type SubagentPhase = string;

export interface AgentDefinition {
  name: string;
  description: string;
  tools: BuiltinTool[];
  extensions: string[];
  model?: string;
  thinking?: string;
  systemPrompt: string;
  disableSkills: boolean;
  disablePromptTemplates: boolean;
}

export interface SpawnAgentParams {
  agent: string;
  intent: string;
  prompt: string;
  show_activity?: boolean;
}

export interface SpawnAgentItem {
  agent: string;
  intent: string;
  prompt: string;
}

export interface SpawnAgentsParams {
  agents: SpawnAgentItem[];
}

export interface SubagentEvent {
  kind: "tool" | "stderr";
  text: string;
}

export interface SubagentRunState {
  intent: string;
  agentType?: string;
  phase: SubagentPhase;
  activeTool?: string;
  currentCommand?: string;
  lastCommand?: string;
  lastOutput?: string;
  lastToolInfo?: string;
  recentEvents: SubagentEvent[];
  toolUseCount: number;
  totalTokens: number;
  resolved?: boolean;
  errorMessage?: string;
  logFile?: string;
  startedAt: number;
  lastUpdateAt: number;
}

export function buildSpawnAgentParams(agentDescription: string) {
  return Type.Object({
    agent: Type.String({ description: agentDescription }),
    intent: Type.String({
      minLength: 1,
      description: "Short label shown in activity titles (3–6 words)",
    }),
    prompt: Type.String({
      description:
        "Full task — brief the agent like a colleague who just walked in",
    }),
    show_activity: Type.Optional(
      Type.Boolean({
        description: "Show live progress updates (default: true)",
      }),
    ),
  });
}

export function buildSpawnAgentsParams(agentDescription: string) {
  return Type.Object({
    agents: Type.Array(
      Type.Object({
        agent: Type.String({ description: agentDescription }),
        intent: Type.String({
          minLength: 1,
          description: "Short label for this agent",
        }),
        prompt: Type.String({ description: "Task for this agent" }),
      }),
      { minItems: 1, description: "Agents to run in parallel" },
    ),
  });
}
