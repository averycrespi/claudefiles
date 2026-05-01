import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { applyExactTextEdits, resolvePlanFilePath } from "./artifact.ts";
import {
  buildWorkflowCompactionSummary,
  deriveNextAction,
  extractTodoItemsFromBranch,
} from "./compaction.ts";
import {
  buildModeContract,
  getManagedToolNamesForMode,
  getThinkingLevelForMode,
} from "./modes.ts";
import { createWorkflowWidget } from "./render.ts";
import type { WorkflowMode } from "./types.ts";

const WIDGET_KEY = "workflow-modes";

type RuntimeState = {
  mode: WorkflowMode;
  baselineTools?: string[];
  baselineThinking?: string;
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

const EDIT_PLAN_PARAMS = Type.Object({
  path: Type.String({
    description:
      "Markdown file path scoped to the repo-root .plans/ directory. Bare filenames are resolved under .plans/.",
  }),
  edits: Type.Array(
    Type.Object({
      oldText: Type.String({
        description:
          "Exact text that must match a unique, non-overlapping region of the original plan file.",
      }),
      newText: Type.String({
        description: "Replacement text for the matched region.",
      }),
    }),
    { minItems: 1 },
  ),
});

export function createWorkflowModesExtension() {
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
        state.mode === "normal"
          ? undefined
          : createWorkflowWidget({
              mode: state.mode,
              nextAction: deriveNextAction({
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
          "Start implementing now. Use the available conversation context and any relevant .plans/*.md files you discover or that the user referenced.",
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

    async function transitionToMode(
      mode: Exclude<WorkflowMode, "normal">,
      args: string,
      ctx: ExtensionContext,
    ): Promise<void> {
      if (state.mode !== mode) {
        applyMode(mode);
      }
      state.mode = mode;
      renderWidget(ctx);
      sendKickoffMessage(mode, args, ctx);
    }

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

        const edited = applyExactTextEdits(originalContent, params.edits);
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
      if (state.mode !== "normal") {
        applyMode("normal");
      }
      state.mode = "normal";
      renderWidget(ctx);
    });

    pi.on("session_tree", async (_event, ctx) => {
      if (state.mode !== "normal") {
        applyMode("normal");
      }
      state.mode = "normal";
      renderWidget(ctx);
    });

    pi.on("session_shutdown", async (_event, ctx) => {
      state.mode = "normal";
      setWorkflowWidget(ctx, undefined);
    });

    pi.on("before_agent_start", async (event) => {
      if (state.mode === "normal") return undefined;
      return {
        systemPrompt: `${event.systemPrompt}\n\n${buildModeContract({
          mode: state.mode,
        })}`,
      };
    });

    pi.on("tool_result", async (event, ctx) => {
      if (state.mode === "normal") return undefined;
      if (event.toolName === "todo") {
        renderWidget(ctx);
      }
      return undefined;
    });

    pi.on("session_before_compact", async (event) => {
      if (state.mode === "normal") return undefined;
      const todos = extractTodoItemsFromBranch(
        event.branchEntries as unknown[],
      );
      const nextAction = deriveNextAction({
        todos,
        mode: state.mode,
      });
      return {
        compaction: {
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          summary: buildWorkflowCompactionSummary({
            mode: state.mode,
            todos,
            nextAction,
          }),
          details: {
            version: 2,
            workflowModes: {
              mode: state.mode,
              nextAction,
            },
          },
        },
      };
    });
  };
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export default createWorkflowModesExtension();
