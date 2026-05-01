import type { WorkflowMode } from "./types.ts";

const PLAN_TOOLS = [
  "read",
  "ls",
  "find",
  "grep",
  "todo",
  "ask_user",
  "web_search",
  "web_fetch",
  "mcp_search",
  "mcp_describe",
  "mcp_call",
  "spawn_agents",
  "workflow_brief",
] as const;

const EXECUTE_TOOLS = ["read", "edit", "write", "bash", "todo"] as const;

const VERIFY_TOOLS = [
  "read",
  "bash",
  "todo",
  "ask_user",
  "mcp_search",
  "mcp_describe",
  "mcp_call",
  "spawn_agents",
] as const;

export function getManagedToolNamesForMode(mode: WorkflowMode): string[] {
  switch (mode) {
    case "plan":
      return [...PLAN_TOOLS];
    case "execute":
      return [...EXECUTE_TOOLS];
    case "verify":
      return [...VERIFY_TOOLS];
    default:
      return [];
  }
}

export function getThinkingLevelForMode(
  mode: WorkflowMode,
): "high" | "low" | undefined {
  switch (mode) {
    case "plan":
      return "high";
    case "execute":
      return "low";
    case "verify":
      return "high";
    default:
      return undefined;
  }
}

export function buildModeContract(options: {
  mode: Exclude<WorkflowMode, "normal">;
  activePlanPath: string;
}): string {
  const shared = [
    "## Workflow modes",
    `Current mode: ${options.mode}`,
    `Active plan artifact: ${options.activePlanPath}`,
    "Use the plan artifact as the durable source of truth and keep TODO state tactical.",
    "Workflow modes apply tool and thinking defaults only on explicit mode transitions.",
  ];

  if (options.mode === "plan") {
    return [
      ...shared,
      "Success criteria: leave the active .plans/... workflow brief clearer, more complete, and ready for execution.",
      "Clarify ambiguous requests before locking in the brief.",
      "Ask one focused question at a time.",
      "Compare approaches when the trade-offs matter and recommend one.",
      "Confirm the chosen direction with the user before converging on the brief.",
      "Read relevant repo context before proposing the plan.",
      "Use workflow_brief to write or replace the active workflow brief; general editing tools are intentionally unavailable in Plan mode.",
      "The workflow_brief content must be a single .plans/... markdown document with: Goal, Constraints, Acceptance Criteria, Chosen Approach, Assumptions / Open Questions, Ordered Tasks, Verification Checklist, and Known Issues / Follow-ups.",
    ].join("\n");
  }

  if (options.mode === "execute") {
    return [
      ...shared,
      "Success criteria: make focused implementation progress that matches the active workflow brief.",
      "Read the plan artifact before changing code.",
      "Use TODO state for short-lived decomposition only; do not treat it as the durable plan.",
      "Keep changes aligned with the brief's acceptance criteria and ordered tasks.",
      "Commit regularly at logical checkpoints as the work progresses.",
      "Do not wait for one giant commit at the end of Execute mode.",
    ].join("\n");
  }

  return [
    ...shared,
    "Success criteria: evaluate the current work against the active workflow brief and acceptance criteria.",
    "Run deterministic checks first.",
    "Do not silently edit code in Verify mode.",
    "Turn findings into explicit next actions for a possible return to Execute mode.",
  ].join("\n");
}
