import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import {
  mergeExtensionConfig,
  parseBooleanEnv,
  readExtensionSettings,
  readPiSettingsFiles,
} from "../_shared/config.ts";
import { applyExactTextEdits, resolvePlanFilePath } from "./artifact.ts";
import {
  buildWorkflowCompactionSummary,
  deriveNextAction,
  extractTodoItemsFromBranch,
} from "./compaction.ts";
import {
  buildModeContract,
  DEFAULT_THINKING_LEVELS,
  getManagedToolNamesForMode,
  getThinkingLevelForMode,
} from "./modes.ts";
import { WORKFLOW_MODE_CHANGED_EVENT, type WorkflowModeState } from "./api.ts";
import type {
  ThinkingLevel,
  WorkflowMode,
  WorkflowModeThinkingLevels,
} from "./types.ts";

type RuntimeState = {
  mode: WorkflowMode;
  pendingCompactionMode?: Exclude<WorkflowMode, "normal">;
  baselineTools?: string[];
  baselineThinking?: string;
  thinkingLevels: WorkflowModeThinkingLevels;
  autoHandoffFixLoopsUsed: number;
};

type WorkflowModesConfig = {
  autoCompactOnModeSwitch: boolean;
  autoCompactMinTokens: number;
  autoCompactOnHandoff: boolean;
  autoCompactHandoffMinTokens: number;
  autoHandoffEnabled: boolean;
  autoHandoffDenyTimeoutMs: number;
  autoHandoffMaxFixLoops: number;
  planThinkingLevel: ThinkingLevel;
  executeThinkingLevel: ThinkingLevel;
  verifyThinkingLevel: ThinkingLevel;
};

type WorkflowModesExtensionOptions = {
  loadConfig?: (cwd: string) => Promise<WorkflowModesConfig>;
};

const DEFAULT_CONFIG: WorkflowModesConfig = {
  autoCompactOnModeSwitch: true,
  autoCompactMinTokens: 50_000,
  autoCompactOnHandoff: true,
  autoCompactHandoffMinTokens: 30_000,
  autoHandoffEnabled: false,
  autoHandoffDenyTimeoutMs: 10_000,
  autoHandoffMaxFixLoops: 2,
  planThinkingLevel: DEFAULT_THINKING_LEVELS.plan,
  executeThinkingLevel: DEFAULT_THINKING_LEVELS.execute,
  verifyThinkingLevel: DEFAULT_THINKING_LEVELS.verify,
};

const WRITE_PLAN_PARAMS = Type.Object({
  path: Type.String({
    description:
      "Markdown file path scoped to the repo-root .plans/ directory. Bare filenames are written under .plans/.",
  }),
  content: Type.String({
    description: "Full markdown content to write to the selected .plans file.",
  }),
});

const HANDOFF_PARAMS = Type.Object({
  target_mode: StringEnum(["execute", "verify"] as const, {
    description:
      "Workflow mode to hand off to. Execute mode may target verify; Verify mode may target execute.",
  }),
  reason: Type.String({
    description:
      "Concise reason for the handoff, used in the user-facing deny prompt and next mode kickoff context.",
  }),
});

const EDIT_PLAN_PARAMS = Type.Object({
  path: Type.String({
    description:
      "Markdown file path scoped to the repo-root .plans/ directory. Bare filenames are resolved under .plans/.",
  }),
  edits: Type.Array(
    Type.Object({
      old_text: Type.String({
        description:
          "Exact text that must match a unique, non-overlapping region of the original plan file.",
      }),
      new_text: Type.String({
        description: "Replacement text for the matched region.",
      }),
    }),
    { minItems: 1 },
  ),
});

export function createWorkflowModesExtension(
  options: WorkflowModesExtensionOptions = {},
) {
  const loadWorkflowModesConfig = options.loadConfig ?? loadConfig;

  return function (pi: ExtensionAPI) {
    const state: RuntimeState = {
      mode: "normal",
      thinkingLevels: { ...DEFAULT_THINKING_LEVELS },
      autoHandoffFixLoopsUsed: 0,
    };

    function getWorkflowModeState(): WorkflowModeState {
      return {
        mode: state.mode,
        baseThinking: getThinkingLevelForMode(state.mode, state.thinkingLevels),
        baselineThinking:
          state.mode === "normal" ? undefined : state.baselineThinking,
      };
    }

    function publishWorkflowModeState(): void {
      pi.events.emit(WORKFLOW_MODE_CHANGED_EVENT, getWorkflowModeState());
    }

    function captureBaselines(): void {
      if (!state.baselineTools) {
        state.baselineTools = pi.getActiveTools();
      }
      if (!state.baselineThinking) {
        state.baselineThinking = `${pi.getThinkingLevel()}`;
      }
    }

    function updateThinkingLevels(config: WorkflowModesConfig): void {
      state.thinkingLevels = {
        plan: config.planThinkingLevel,
        execute: config.executeThinkingLevel,
        verify: config.verifyThinkingLevel,
      };
    }

    function applyMode(mode: WorkflowMode): void {
      captureBaselines();
      if (!state.baselineTools || !state.baselineThinking) return;

      if (mode === "normal") {
        pi.setActiveTools([...state.baselineTools]);
        pi.setThinkingLevel(state.baselineThinking as any);
        return;
      }

      const available = new Set(pi.getAllTools().map((tool) => tool.name));
      const nextTools = getManagedToolNamesForMode(mode).filter((name) =>
        available.has(name),
      );
      pi.setActiveTools(nextTools);
      const thinking = getThinkingLevelForMode(mode, state.thinkingLevels);
      if (thinking) {
        pi.setThinkingLevel(thinking as any);
      }
    }

    function buildKickoffMessage(
      mode: Exclude<WorkflowMode, "normal">,
      args: string,
    ): string {
      const lines = [`You are now in ${capitalize(mode)} mode.`];
      const trimmedArgs = args.trim();

      if (trimmedArgs) {
        lines.push(`User context from /${mode}:\n${trimmedArgs}`);
      } else {
        lines.push(
          "No additional command arguments were provided. Use the current conversation and repo context to get started.",
        );
      }

      if (mode === "plan") {
        lines.push(
          "Start planning now. Read relevant repo context, clarify what matters, and create or refine .plans/*.md files only when you have enough information.",
        );
      } else if (mode === "execute") {
        lines.push(
          "Start implementing now. Use the available conversation context and any relevant .plans/*.md files you discover or that the user referenced. If this is non-trivial or has multiple steps, call todo now to create or update the working checklist before editing files. Keep exactly one item in_progress while working.",
        );
      } else {
        lines.push(
          "Start verification now. Run deterministic checks first and review the current work against the available conversation context and any relevant .plans/*.md files.",
        );
      }

      return lines.join("\n\n");
    }

    function sendKickoffMessage(
      mode: Exclude<WorkflowMode, "normal">,
      args: string,
      ctx: ExtensionContext,
    ): void {
      const message = buildKickoffMessage(mode, args);
      if (ctx.isIdle()) {
        pi.sendUserMessage(message);
        return;
      }
      pi.sendUserMessage(message, { deliverAs: "steer" });
    }

    function sendHandoffKickoffMessage(
      mode: Exclude<WorkflowMode, "normal">,
      args: string,
    ): void {
      pi.sendUserMessage(buildKickoffMessage(mode, args), {
        deliverAs: "followUp",
      });
    }

    async function updateAutoHandoffStatus(
      ctx: ExtensionContext,
    ): Promise<void> {
      if (!ctx.hasUI) return;
      const config = await loadWorkflowModesConfig(ctx.cwd);
      if (!config.autoHandoffEnabled || state.mode === "normal") {
        ctx.ui.setStatus("workflow-modes", undefined);
        return;
      }

      const exhausted =
        state.autoHandoffFixLoopsUsed >= config.autoHandoffMaxFixLoops;
      const budget = `${state.autoHandoffFixLoopsUsed}/${config.autoHandoffMaxFixLoops}`;
      ctx.ui.setStatus(
        "workflow-modes",
        exhausted ? `↻ exhausted ${budget}` : `↻ auto ${budget}`,
      );
    }

    async function transitionToMode(
      mode: Exclude<WorkflowMode, "normal">,
      args: string,
      ctx: ExtensionCommandContext,
    ): Promise<void> {
      state.autoHandoffFixLoopsUsed = 0;
      const config = await loadWorkflowModesConfig(ctx.cwd);
      updateThinkingLevels(config);
      if (state.mode !== mode) {
        await maybeCompactBeforeModeSwitch(mode, ctx, {
          enabled: config.autoCompactOnModeSwitch,
          minTokens: config.autoCompactMinTokens,
          label: "Workflow mode",
        });
        applyMode(mode);
      }
      state.mode = mode;
      publishWorkflowModeState();
      await updateAutoHandoffStatus(ctx);
      sendKickoffMessage(mode, args, ctx);
    }

    async function transitionToModeFromHandoff(
      mode: "execute" | "verify",
      args: string,
      ctx: ExtensionContext,
      config: WorkflowModesConfig,
    ): Promise<void> {
      updateThinkingLevels(config);
      if (state.mode !== mode) {
        await maybeCompactBeforeModeSwitch(mode, ctx, {
          enabled: config.autoCompactOnHandoff,
          minTokens: config.autoCompactHandoffMinTokens,
          label: "Workflow handoff",
        });
        applyMode(mode);
      }
      state.mode = mode;
      publishWorkflowModeState();
      await updateAutoHandoffStatus(ctx);
      sendHandoffKickoffMessage(mode, args);
    }

    async function maybeCompactBeforeModeSwitch(
      mode: Exclude<WorkflowMode, "normal">,
      ctx: ExtensionContext,
      options: {
        enabled: boolean;
        minTokens: number;
        label: "Workflow mode" | "Workflow handoff";
      },
    ): Promise<void> {
      if (!options.enabled || !ctx.isIdle()) return;

      const tokens = ctx.getContextUsage()?.tokens;
      if (typeof tokens !== "number" || tokens < options.minTokens) {
        return;
      }

      state.pendingCompactionMode = mode;
      await new Promise<void>((resolve) => {
        if (ctx.hasUI) {
          ctx.ui.notify(`Compacting before ${mode} mode`, "info");
        }
        ctx.compact({
          customInstructions: `Prepare the session for switching to ${mode} workflow mode. Preserve current goals, decisions, TODOs, changed files, and next actions.`,
          onComplete: () => {
            state.pendingCompactionMode = undefined;
            if (ctx.hasUI) {
              ctx.ui.notify(
                `${options.label} pre-compaction completed`,
                "info",
              );
            }
            resolve();
          },
          onError: (error) => {
            state.pendingCompactionMode = undefined;
            if (ctx.hasUI) {
              ctx.ui.notify(
                `${options.label} pre-compaction failed: ${error.message}`,
                "error",
              );
            }
            resolve();
          },
        });
      });
    }

    pi.registerTool({
      name: "workflow_handoff",
      label: "Workflow Handoff",
      description:
        "Request an automatic workflow mode handoff between Execute and Verify modes when auto handoff is enabled.",
      parameters: HANDOFF_PARAMS,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const config = await loadWorkflowModesConfig(ctx.cwd);
        updateThinkingLevels(config);
        if (!config.autoHandoffEnabled) {
          return {
            content: [
              {
                type: "text" as const,
                text: "workflow_handoff: automatic handoff is disabled by configuration",
              },
            ],
            details: {},
          };
        }

        const targetMode = params.target_mode;
        if (state.mode === "execute" && targetMode !== "verify") {
          return {
            content: [
              {
                type: "text" as const,
                text: "workflow_handoff: Execute mode can only hand off to Verify mode",
              },
            ],
            details: {},
          };
        }
        if (state.mode === "verify" && targetMode !== "execute") {
          return {
            content: [
              {
                type: "text" as const,
                text: "workflow_handoff: Verify mode can only hand off to Execute mode",
              },
            ],
            details: {},
          };
        }
        if (state.mode !== "execute" && state.mode !== "verify") {
          return {
            content: [
              {
                type: "text" as const,
                text: "workflow_handoff: only available while workflow modes are in Execute or Verify mode",
              },
            ],
            details: {},
          };
        }

        if (
          state.mode === "verify" &&
          state.autoHandoffFixLoopsUsed >= config.autoHandoffMaxFixLoops
        ) {
          await updateAutoHandoffStatus(ctx);
          return {
            content: [
              {
                type: "text" as const,
                text: `workflow_handoff: automatic fix-loop cap reached (${state.autoHandoffFixLoopsUsed}/${config.autoHandoffMaxFixLoops})`,
              },
            ],
            details: {
              fixLoopsUsed: state.autoHandoffFixLoopsUsed,
              maxFixLoops: config.autoHandoffMaxFixLoops,
            },
          };
        }

        const reason = params.reason.trim();
        const displayReason = reason || "No reason provided.";
        if (ctx.hasUI) {
          const choice = await ctx.ui.select(
            `Agent triggered handoff to ${capitalize(targetMode)} mode: ${displayReason}`,
            ["Cancel"],
            { timeout: config.autoHandoffDenyTimeoutMs },
          );
          if (choice === "Cancel") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "workflow_handoff: handoff denied by user",
                },
              ],
              details: { denied: true },
            };
          }
        }

        if (state.mode === "verify" && targetMode === "execute") {
          state.autoHandoffFixLoopsUsed += 1;
        }

        await transitionToModeFromHandoff(
          targetMode,
          displayReason,
          ctx,
          config,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `workflow_handoff: handed off to ${targetMode} mode`,
            },
          ],
          details: {
            targetMode,
            fixLoopsUsed: state.autoHandoffFixLoopsUsed,
            maxFixLoops: config.autoHandoffMaxFixLoops,
          },
          terminate: true,
        };
      },
    });

    pi.registerTool({
      name: "write_plan",
      label: "Write Plan",
      description:
        "Create or replace a markdown file under the repo-root .plans/ directory while in Plan mode.",
      parameters: WRITE_PLAN_PARAMS,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        if (state.mode !== "plan") {
          return {
            content: [
              {
                type: "text" as const,
                text: "write_plan: only available while workflow modes are in Plan mode",
              },
            ],
            details: {},
          };
        }

        const resolved = resolvePlanFilePath(ctx.cwd, params.path);
        if (!resolved.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `write_plan: ${resolved.error}`,
              },
            ],
            details: {},
          };
        }

        await mkdir(dirname(resolved.absolutePath), { recursive: true });
        await writeFile(resolved.absolutePath, params.content, "utf8");
        return {
          content: [
            {
              type: "text" as const,
              text: `Wrote ${resolved.displayPath}`,
            },
          ],
          details: { path: resolved.displayPath },
        };
      },
    });

    pi.registerTool({
      name: "edit_plan",
      label: "Edit Plan",
      description:
        "Apply exact text replacements to a markdown file under the repo-root .plans/ directory while in Plan mode.",
      parameters: EDIT_PLAN_PARAMS,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        if (state.mode !== "plan") {
          return {
            content: [
              {
                type: "text" as const,
                text: "edit_plan: only available while workflow modes are in Plan mode",
              },
            ],
            details: {},
          };
        }

        const resolved = resolvePlanFilePath(ctx.cwd, params.path);
        if (!resolved.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `edit_plan: ${resolved.error}`,
              },
            ],
            details: {},
          };
        }

        let originalContent: string;
        try {
          originalContent = await readFile(resolved.absolutePath, "utf8");
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: `edit_plan: ${resolved.displayPath} does not exist`,
              },
            ],
            details: {},
          };
        }

        const edits = params.edits.map((edit) => ({
          oldText: edit.old_text,
          newText: edit.new_text,
        }));
        const edited = applyExactTextEdits(originalContent, edits);
        if (!edited.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `edit_plan: ${edited.error}`,
              },
            ],
            details: {},
          };
        }

        await writeFile(resolved.absolutePath, edited.content, "utf8");
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated ${resolved.displayPath}`,
            },
          ],
          details: { path: resolved.displayPath },
        };
      },
    });

    pi.registerCommand("normal", {
      description: "Exit workflow modes and restore ordinary Pi behavior.",
      handler: async (_args, ctx) => {
        captureBaselines();
        if (state.mode !== "normal") {
          applyMode("normal");
        }
        state.mode = "normal";
        state.autoHandoffFixLoopsUsed = 0;
        publishWorkflowModeState();
        await updateAutoHandoffStatus(ctx);
      },
    });

    for (const mode of ["plan", "execute", "verify"] as const) {
      pi.registerCommand(mode, {
        description: `Enter ${mode} mode for workflow modes.`,
        handler: async (args, ctx) => {
          await transitionToMode(mode, args, ctx);
        },
      });
    }

    pi.on("session_start", async (_event, ctx) => {
      updateThinkingLevels(await loadWorkflowModesConfig(ctx.cwd));
      captureBaselines();
      if (state.mode !== "normal") {
        applyMode("normal");
      }
      state.mode = "normal";
      state.autoHandoffFixLoopsUsed = 0;
      publishWorkflowModeState();
      await updateAutoHandoffStatus(ctx);
    });

    pi.on("session_tree", async (_event, ctx) => {
      if (state.mode !== "normal") {
        applyMode("normal");
      }
      state.mode = "normal";
      state.autoHandoffFixLoopsUsed = 0;
      publishWorkflowModeState();
      await updateAutoHandoffStatus(ctx);
    });

    pi.on("session_shutdown", async () => {
      state.mode = "normal";
      state.autoHandoffFixLoopsUsed = 0;
      publishWorkflowModeState();
    });

    pi.on("before_agent_start", async (event, ctx) => {
      if (state.mode === "normal") return undefined;
      const config = await loadWorkflowModesConfig(ctx.cwd);
      updateThinkingLevels(config);
      return {
        systemPrompt: `${event.systemPrompt}\n\n${buildModeContract({
          mode: state.mode,
          autoHandoffEnabled: config.autoHandoffEnabled,
        })}`,
      };
    });

    pi.on("session_before_compact", async (event) => {
      if (state.mode === "normal") return undefined;
      const todos = extractTodoItemsFromBranch(
        event.branchEntries as unknown[],
      );
      const compactionMode = state.pendingCompactionMode ?? state.mode;
      const nextAction = deriveNextAction({
        todos,
        mode: compactionMode,
      });
      return {
        compaction: {
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          summary: buildWorkflowCompactionSummary({
            mode: compactionMode,
            todos,
            nextAction,
          }),
          details: {
            version: 2,
            workflowModes: {
              mode: compactionMode,
              nextAction,
            },
          },
        },
      };
    });
  };
}

export async function loadConfig(cwd: string): Promise<WorkflowModesConfig> {
  const { globalSettings, projectSettings } = await readPiSettingsFiles({
    agentDir: getAgentDir(),
    cwd,
  });
  const merged = mergeExtensionConfig({
    defaults: DEFAULT_CONFIG,
    globalSettings: readExtensionSettings(globalSettings, "workflow-modes"),
    projectSettings: readExtensionSettings(projectSettings, "workflow-modes"),
    envSettings: readEnvSettings(),
  });

  return {
    autoCompactOnModeSwitch:
      typeof merged.autoCompactOnModeSwitch === "boolean"
        ? merged.autoCompactOnModeSwitch
        : DEFAULT_CONFIG.autoCompactOnModeSwitch,
    autoCompactMinTokens:
      typeof merged.autoCompactMinTokens === "number" &&
      Number.isFinite(merged.autoCompactMinTokens) &&
      merged.autoCompactMinTokens >= 0
        ? merged.autoCompactMinTokens
        : DEFAULT_CONFIG.autoCompactMinTokens,
    autoCompactOnHandoff:
      typeof merged.autoCompactOnHandoff === "boolean"
        ? merged.autoCompactOnHandoff
        : DEFAULT_CONFIG.autoCompactOnHandoff,
    autoCompactHandoffMinTokens:
      typeof merged.autoCompactHandoffMinTokens === "number" &&
      Number.isFinite(merged.autoCompactHandoffMinTokens) &&
      merged.autoCompactHandoffMinTokens >= 0
        ? merged.autoCompactHandoffMinTokens
        : DEFAULT_CONFIG.autoCompactHandoffMinTokens,
    autoHandoffEnabled:
      typeof merged.autoHandoffEnabled === "boolean"
        ? merged.autoHandoffEnabled
        : DEFAULT_CONFIG.autoHandoffEnabled,
    autoHandoffDenyTimeoutMs:
      typeof merged.autoHandoffDenyTimeoutMs === "number" &&
      Number.isFinite(merged.autoHandoffDenyTimeoutMs) &&
      merged.autoHandoffDenyTimeoutMs >= 0
        ? merged.autoHandoffDenyTimeoutMs
        : DEFAULT_CONFIG.autoHandoffDenyTimeoutMs,
    autoHandoffMaxFixLoops:
      typeof merged.autoHandoffMaxFixLoops === "number" &&
      Number.isInteger(merged.autoHandoffMaxFixLoops) &&
      merged.autoHandoffMaxFixLoops >= 0
        ? merged.autoHandoffMaxFixLoops
        : DEFAULT_CONFIG.autoHandoffMaxFixLoops,
    planThinkingLevel: parseThinkingLevel(
      merged.planThinkingLevel,
      DEFAULT_CONFIG.planThinkingLevel,
    ),
    executeThinkingLevel: parseThinkingLevel(
      merged.executeThinkingLevel,
      DEFAULT_CONFIG.executeThinkingLevel,
    ),
    verifyThinkingLevel: parseThinkingLevel(
      merged.verifyThinkingLevel,
      DEFAULT_CONFIG.verifyThinkingLevel,
    ),
  };
}

export function readEnvSettings(): Partial<WorkflowModesConfig> {
  const settings: Partial<WorkflowModesConfig> = {};
  setBooleanEnv(
    settings,
    "autoCompactOnModeSwitch",
    process.env.WORKFLOW_MODES_AUTO_COMPACT_ON_MODE_SWITCH,
  );
  setNumberEnv(
    settings,
    "autoCompactMinTokens",
    process.env.WORKFLOW_MODES_AUTO_COMPACT_MIN_TOKENS,
    false,
  );
  setBooleanEnv(
    settings,
    "autoCompactOnHandoff",
    process.env.WORKFLOW_MODES_AUTO_COMPACT_ON_HANDOFF,
  );
  setNumberEnv(
    settings,
    "autoCompactHandoffMinTokens",
    process.env.WORKFLOW_MODES_AUTO_COMPACT_HANDOFF_MIN_TOKENS,
    false,
  );
  setBooleanEnv(
    settings,
    "autoHandoffEnabled",
    process.env.WORKFLOW_MODES_AUTO_HANDOFF_ENABLED,
  );
  setNumberEnv(
    settings,
    "autoHandoffDenyTimeoutMs",
    process.env.WORKFLOW_MODES_AUTO_HANDOFF_DENY_TIMEOUT_MS,
    false,
  );
  setNumberEnv(
    settings,
    "autoHandoffMaxFixLoops",
    process.env.WORKFLOW_MODES_AUTO_HANDOFF_MAX_FIX_LOOPS,
    true,
  );
  setThinkingLevelEnv(
    settings,
    "planThinkingLevel",
    process.env.WORKFLOW_MODES_PLAN_THINKING_LEVEL,
  );
  setThinkingLevelEnv(
    settings,
    "executeThinkingLevel",
    process.env.WORKFLOW_MODES_EXECUTE_THINKING_LEVEL,
  );
  setThinkingLevelEnv(
    settings,
    "verifyThinkingLevel",
    process.env.WORKFLOW_MODES_VERIFY_THINKING_LEVEL,
  );
  return settings;
}

function setBooleanEnv<K extends keyof WorkflowModesConfig>(
  settings: Partial<WorkflowModesConfig>,
  key: K,
  value: string | undefined,
): void {
  const parsed = parseBooleanEnv(value);
  if (parsed !== undefined) {
    (settings as Record<string, unknown>)[key] = parsed;
  }
}

function setNumberEnv<K extends keyof WorkflowModesConfig>(
  settings: Partial<WorkflowModesConfig>,
  key: K,
  value: string | undefined,
  integer: boolean,
): void {
  if (value === undefined || value.trim() === "") return;
  const parsed = Number(value);
  if (
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    (!integer || Number.isInteger(parsed))
  ) {
    (settings as Record<string, unknown>)[key] = parsed;
  }
}

function setThinkingLevelEnv<K extends keyof WorkflowModesConfig>(
  settings: Partial<WorkflowModesConfig>,
  key: K,
  value: string | undefined,
): void {
  if (value !== undefined && isThinkingLevel(value.trim())) {
    (settings as Record<string, unknown>)[key] = value.trim();
  }
}

function parseThinkingLevel(
  value: unknown,
  fallback: ThinkingLevel,
): ThinkingLevel {
  return typeof value === "string" && isThinkingLevel(value) ? value : fallback;
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return ["off", "minimal", "low", "medium", "high", "xhigh"].includes(value);
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export default createWorkflowModesExtension();
