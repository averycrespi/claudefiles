import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadSpecWorkflowConfig, type SpecWorkflowConfig } from "./config.ts";
import { registerSpecWorkflowTools } from "./tools.ts";

const COMMANDS = [
  ["spec-plan", "Create or revise a durable spec workflow plan"],
  ["spec-approve", "Approve compiled spec artifacts for execution"],
  ["spec-execute", "Execute the active approved spec sequentially"],
  ["spec-verify", "Verify the active spec and run bounded fixes"],
  ["spec-report", "Write the final spec workflow report"],
  ["spec-status", "Show active spec workflow status"],
  ["spec-abort", "Cancel the active spec workflow without deleting artifacts"],
] as const;

type RuntimeState = {
  activeSlug?: string;
  phase: string;
  config: SpecWorkflowConfig;
};

type SpecWorkflowExtensionOptions = {
  loadConfig?: (
    cwd: string,
  ) => Promise<{ config: SpecWorkflowConfig; warnings: string[] }>;
};

function notify(
  ctx: ExtensionContext,
  message: string,
  level: "info" | "warning" = "info",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
}

function commandHandler(name: string, state: RuntimeState) {
  return async (args: string, ctx: ExtensionContext) => {
    const slug = args.trim().split(/\s+/)[0];
    if (slug && name === "spec-plan") state.activeSlug = slug;
    if (name === "spec-abort") state.phase = "canceled";
    else if (name === "spec-status") state.phase ||= "idle";
    else state.phase = name.replace(/^spec-/, "");
    notify(
      ctx,
      state.activeSlug
        ? `spec-workflow ${state.phase}: ${state.activeSlug}`
        : `spec-workflow ${state.phase}`,
    );
  };
}

export function createSpecWorkflowExtension(
  options: SpecWorkflowExtensionOptions = {},
) {
  const loadConfig = options.loadConfig ?? loadSpecWorkflowConfig;

  return function specWorkflowExtension(pi: ExtensionAPI) {
    registerSpecWorkflowTools(pi);

    const state: RuntimeState = {
      phase: "idle",
      config: {
        enabled: true,
        showWidget: true,
        autoChallenge: true,
        maxFixRounds: 2,
        autoCommitTasks: true,
        autoCompactOnPhaseChange: true,
        autoCompactMinTokens: 50_000,
        planThinkingLevel: "medium",
        executeThinkingLevel: "low",
        verifyThinkingLevel: "high",
      },
    };

    for (const [name, description] of COMMANDS) {
      pi.registerCommand(name, {
        description,
        handler: commandHandler(name, state),
      });
    }

    pi.on("session_start", async (_event, ctx) => {
      const { config, warnings } = await loadConfig(ctx.cwd);
      state.config = config;
      for (const warning of warnings) notify(ctx, warning, "warning");
    });

    pi.on("before_agent_start", async (event) => {
      if (!state.config.enabled || state.phase === "idle") return event;
      return {
        ...event,
        systemPrompt: `${event.systemPrompt}\n\n## Spec Workflow\nActive phase: ${state.phase}\nActive slug: ${state.activeSlug ?? "none"}\nArtifacts live under .specs/<slug>/. Treat runtime.json as execution state and markdown as human intent.`,
      };
    });
  };
}

export default createSpecWorkflowExtension();
