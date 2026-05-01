import { stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  buildWorkflowBriefTemplate,
  ensureWorkflowBrief,
  extractPlanGoal,
  readWorkflowBrief,
  resolvePlanPathArgument,
  toStoredPlanPath,
  validateWorkflowBrief,
} from "./artifact.ts";
import {
  buildWorkflowCompactionSummary,
  deriveNextAction,
  extractTodoItemsFromBranch,
  summarizeToolResultText,
} from "./compaction.ts";
import {
  buildModeContract,
  getManagedToolNamesForMode,
  getThinkingLevelForMode,
} from "./modes.ts";
import { createWorkflowWidget } from "./render.ts";
import type { WorkflowMode } from "./types.ts";

const WIDGET_KEY = "workflow-modes";
const STATE_ENTRY_TYPE = "workflow-modes-state";

type WorkflowModesOptions = {
  now?: () => Date;
};

type PersistedState = {
  version: 1;
  activePlanPath: string | null;
};

type RuntimeState = {
  mode: WorkflowMode;
  activePlanPath?: string;
  focus?: string;
  lastOutcome?: string;
  baselineTools?: string[];
  baselineThinking?: string;
};

const WORKFLOW_BRIEF_PARAMS = Type.Object({
  content: Type.String({
    description:
      "Full markdown content for the active .plans/... workflow brief. Read the current file first, then replace it with the updated brief.",
  }),
});

export function createWorkflowModesExtension(
  options: WorkflowModesOptions = {},
) {
  return function (pi: ExtensionAPI) {
    const state: RuntimeState = { mode: "normal" };

    function setWorkflowWidget(
      ctx: ExtensionContext,
      content: ReturnType<typeof createWorkflowWidget> | undefined,
    ): void {
      const piAny = pi as any;
      if (piAny.hasUI && typeof piAny.setWidget === "function") {
        piAny.setWidget(WIDGET_KEY, content);
        return;
      }
      if (!ctx.hasUI) return;
      ctx.ui.setWidget(WIDGET_KEY, content as any, {
        placement: "aboveEditor",
      });
    }

    function renderWidget(ctx: ExtensionContext): void {
      setWorkflowWidget(
        ctx,
        state.mode === "normal" || !state.activePlanPath
          ? undefined
          : createWorkflowWidget({
              mode: state.mode,
              activePlanPath: state.activePlanPath,
              focus:
                state.focus ??
                deriveNextAction({
                  focus: state.focus,
                  todos: extractTodoItemsFromBranch(
                    ctx.sessionManager.getBranch(),
                  ),
                  mode: state.mode,
                }),
            }),
      );
    }

    function captureBaselines(): void {
      if (!state.baselineTools) {
        state.baselineTools = pi.getActiveTools();
      }
      if (!state.baselineThinking) {
        state.baselineThinking = `${pi.getThinkingLevel()}`;
      }
    }

    function persistActivePlanPath(): void {
      pi.appendEntry<PersistedState>(STATE_ENTRY_TYPE, {
        version: 1,
        activePlanPath: state.activePlanPath ?? null,
      });
    }

    function restorePersistedState(ctx: ExtensionContext): void {
      let restored: string | undefined;
      for (const entry of ctx.sessionManager.getBranch()) {
        if (!entry || typeof entry !== "object") continue;
        if (
          (entry as { type?: unknown }).type === "custom" &&
          (entry as { customType?: unknown }).customType === STATE_ENTRY_TYPE
        ) {
          const data = (entry as { data?: PersistedState }).data;
          if (!data || data.version !== 1) continue;
          restored = data.activePlanPath ?? undefined;
        }
      }
      state.activePlanPath = restored;
    }

    async function validateActivePlanPath(
      ctx: ExtensionContext,
    ): Promise<void> {
      if (!state.activePlanPath) return;
      try {
        await stat(resolve(ctx.cwd, state.activePlanPath));
      } catch {
        state.activePlanPath = undefined;
        persistActivePlanPath();
        if (ctx.hasUI) {
          ctx.ui.notify(
            "workflow-modes: cleared missing active plan reference",
            "warning",
          );
        }
      }
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
      const thinking = getThinkingLevelForMode(mode);
      if (thinking) {
        pi.setThinkingLevel(thinking as any);
      }
    }

    async function ensureReadablePlanPath(
      cwd: string,
      planPath: string,
    ): Promise<string> {
      await readWorkflowBrief(cwd, planPath);
      return planPath;
    }

    async function resolveCommandPlanPath(
      mode: Exclude<WorkflowMode, "normal">,
      args: string,
      ctx: ExtensionContext,
    ): Promise<{ planPath?: string; focus?: string }> {
      let raw = args.trim();
      if (!raw) {
        if (state.activePlanPath) {
          await ensureReadablePlanPath(ctx.cwd, state.activePlanPath);
          return { planPath: state.activePlanPath };
        }
        if (!ctx.hasUI) {
          ctx.ui.notify(
            `/${mode}: provide workflow context or a .plans path when no workflow is active`,
            "warning",
          );
          return {};
        }
        raw =
          (
            await ctx.ui.input(
              `/${mode}`,
              "Describe the workflow or enter a .plans/... path",
            )
          )?.trim() ?? "";
        if (!raw) return {};
      }

      const explicitPath = resolvePlanPathArgument(raw, ctx.cwd);
      if (explicitPath) {
        const planPath = toStoredPlanPath(ctx.cwd, explicitPath);
        await ensureReadablePlanPath(ctx.cwd, planPath);
        return { planPath };
      }

      if (state.activePlanPath && ctx.hasUI && args.trim().length > 0) {
        const reuse = await ctx.ui.confirm(
          `Reuse ${state.activePlanPath}?`,
          `Use the active workflow for this ${mode} request?`,
        );
        if (reuse) {
          await ensureReadablePlanPath(ctx.cwd, state.activePlanPath);
          return { planPath: state.activePlanPath, focus: raw };
        }
      }

      const planPath = await ensureWorkflowBrief({
        cwd: ctx.cwd,
        context: raw,
        mode,
        now: (options.now ?? (() => new Date()))(),
      });
      return { planPath, focus: raw };
    }

    async function transitionToMode(
      mode: Exclude<WorkflowMode, "normal">,
      args: string,
      ctx: ExtensionContext,
    ): Promise<void> {
      const resolved = await resolveCommandPlanPath(mode, args, ctx);
      if (!resolved.planPath) return;

      state.activePlanPath = resolved.planPath;
      state.focus = resolved.focus;
      state.lastOutcome = undefined;
      persistActivePlanPath();

      if (state.mode !== mode) {
        applyMode(mode);
      }
      state.mode = mode;
      renderWidget(ctx);
    }

    pi.registerTool({
      name: "workflow_brief",
      label: "Workflow Brief",
      description:
        "Write the active .plans/... workflow brief during Plan mode. Replaces the full file content after validating the expected section headings.",
      parameters: WORKFLOW_BRIEF_PARAMS,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        if (state.mode !== "plan") {
          return {
            content: [
              {
                type: "text" as const,
                text: "workflow_brief: only available while workflow modes are in Plan mode",
              },
            ],
            details: {},
          };
        }
        if (!state.activePlanPath) {
          return {
            content: [
              {
                type: "text" as const,
                text: "workflow_brief: no active workflow brief is selected",
              },
            ],
            details: {},
          };
        }
        const validation = validateWorkflowBrief(params.content);
        if (!validation.valid) {
          return {
            content: [
              {
                type: "text" as const,
                text: `workflow_brief: missing required sections: ${validation.missingSections.join(", ")}`,
              },
            ],
            details: { missingSections: validation.missingSections },
          };
        }

        await writeFile(
          resolve(ctx.cwd, state.activePlanPath),
          params.content,
          "utf8",
        );
        state.focus = extractPlanGoal(params.content) ?? state.focus;
        renderWidget(ctx);
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated ${state.activePlanPath}`,
            },
          ],
          details: { path: state.activePlanPath },
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
        state.focus = undefined;
        state.lastOutcome = undefined;
        renderWidget(ctx);
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
      captureBaselines();
      restorePersistedState(ctx);
      await validateActivePlanPath(ctx);
      if (state.mode !== "normal") {
        applyMode("normal");
      }
      state.mode = "normal";
      state.focus = undefined;
      state.lastOutcome = undefined;
      renderWidget(ctx);
    });

    pi.on("session_tree", async (_event, ctx) => {
      restorePersistedState(ctx);
      await validateActivePlanPath(ctx);
      if (state.mode !== "normal") {
        applyMode("normal");
      }
      state.mode = "normal";
      state.focus = undefined;
      state.lastOutcome = undefined;
      renderWidget(ctx);
    });

    pi.on("session_shutdown", async (_event, ctx) => {
      state.mode = "normal";
      state.focus = undefined;
      state.lastOutcome = undefined;
      setWorkflowWidget(ctx, undefined);
    });

    pi.on("before_agent_start", async (event) => {
      if (state.mode === "normal" || !state.activePlanPath) return undefined;
      return {
        systemPrompt: `${event.systemPrompt}\n\n${buildModeContract({
          mode: state.mode,
          activePlanPath: state.activePlanPath,
        })}`,
      };
    });

    pi.on("tool_result", async (event, ctx) => {
      if (state.mode === "normal") return undefined;
      if (event.toolName === "todo") {
        renderWidget(ctx);
        return undefined;
      }
      const summary = summarizeToolResultText(event.content);
      if (summary) {
        state.lastOutcome = `${event.toolName}: ${summary}`;
        renderWidget(ctx);
      }
      return undefined;
    });

    pi.on("session_before_compact", async (event, ctx) => {
      if (state.mode === "normal" || !state.activePlanPath) return undefined;
      let planGoal: string | undefined;
      try {
        planGoal = extractPlanGoal(
          await readWorkflowBrief(ctx.cwd, state.activePlanPath),
        );
      } catch {
        planGoal = undefined;
      }
      const todos = extractTodoItemsFromBranch(
        event.branchEntries as unknown[],
      );
      const nextAction = deriveNextAction({
        focus: state.focus,
        todos,
        mode: state.mode,
      });
      return {
        compaction: {
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          summary: buildWorkflowCompactionSummary({
            mode: state.mode,
            activePlanPath: state.activePlanPath,
            planGoal,
            todos,
            recentOutcome: state.lastOutcome,
            nextAction,
          }),
          details: {
            version: 1,
            workflowModes: {
              mode: state.mode,
              activePlanPath: state.activePlanPath,
              nextAction,
            },
          },
        },
      };
    });
  };
}

export default createWorkflowModesExtension();
