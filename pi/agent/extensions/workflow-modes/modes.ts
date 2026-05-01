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
  "write_plan",
  "edit_plan",
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
}): string {
  const shared = [
    "## Workflow modes",
    `Current mode: ${options.mode}`,
    "Workflow modes apply tool and thinking defaults only on explicit mode transitions.",
    "Mode switch commands may send a kickoff user message so work starts immediately in the new mode.",
  ];

  if (options.mode === "plan") {
    return [
      ...shared,
      "Success criteria: leave the workflow clearer, more complete, and ready for execution.",
      "Clarify ambiguous requests before locking in the plan.",
      "Focus on understanding the purpose, constraints, and success criteria before writing the plan.",
      "Ask one focused question at a time.",
      "Prefer multiple-choice questions when they fit.",
      "Compare 2-3 approaches when the trade-offs matter and recommend one.",
      "Confirm the chosen direction with the user before converging on the plan.",
      "Read relevant repo context before proposing the plan.",
      "Use YAGNI ruthlessly; avoid speculative scope and overdesign.",
      "Plan files belong under .plans/ at the repo root.",
      "Use write_plan to create a new plan file and edit_plan to refine an existing plan file under .plans/.",
      "Do not use general editing tools in Plan mode.",
      "Only write or update a plan after you have enough context.",
      "Include 3-7 testable acceptance criteria whenever the task is substantial enough to need them.",
      "Each acceptance criterion should be observable via a test, command output, or file/UI state — not a feeling.",
      "Plan files should be markdown and usually include: Goal, Constraints, Acceptance Criteria, Chosen Approach, Assumptions / Open Questions, Ordered Tasks, Verification Checklist, and Known Issues / Follow-ups.",
    ].join("\n");
  }

  if (options.mode === "execute") {
    return [
      ...shared,
      "Success criteria: make focused implementation progress that matches the available workflow context.",
      "Read relevant .plans/*.md files before changing code when they are available or referenced by the user.",
      "Use TODO state for short-lived decomposition only; do not treat it as the durable plan.",
      "Keep changes aligned with the current conversation, acceptance criteria, and ordered tasks.",
      "Commit regularly at logical checkpoints as the work progresses.",
      "Do not wait for one giant commit at the end of Execute mode.",
    ].join("\n");
  }

  return [
    ...shared,
    "Success criteria: evaluate the current work against the available workflow context and acceptance criteria.",
    "Read relevant .plans/*.md files before reviewing when they are available or referenced by the user.",
    "Run deterministic checks first.",
    "Do not silently edit code in Verify mode.",
    "Turn findings into explicit next actions for a possible return to Execute mode.",
  ].join("\n");
}
