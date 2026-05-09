import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import {
  ARTIFACT_FILENAMES,
  editArtifact,
  resolveArtifactPath,
  writeArtifact,
  type ArtifactFilename,
} from "./artifacts.ts";
import { compileSpecRuntime, formatDiagnostics } from "./compiler.ts";
import { createEvent } from "./events.ts";
import {
  formatStatus,
  renderSpecToolCall,
  renderSpecToolResult,
} from "./render.ts";
import {
  readRuntime,
  runtimePathFor,
  updateRuntimeWithEvent,
  writeRuntime,
} from "./state.ts";

const artifactNameSchema = Type.Union(
  ARTIFACT_FILENAMES.map((name) => Type.Literal(name)) as any,
);

const writeArtifactParamsSchema = Type.Object({
  slug: Type.String({ description: "Spec slug in kebab-case." }),
  filename: artifactNameSchema,
  content: Type.String({ description: "Full artifact content to write." }),
});

type WriteArtifactParams = Static<typeof writeArtifactParamsSchema>;

const editArtifactParamsSchema = Type.Object({
  slug: Type.String({ description: "Spec slug in kebab-case." }),
  filename: artifactNameSchema,
  edits: Type.Array(
    Type.Object({
      old_text: Type.String({
        description: "Exact text that must match once.",
      }),
      new_text: Type.String({ description: "Replacement text." }),
    }),
    { minItems: 1 },
  ),
});

type EditArtifactParams = Static<typeof editArtifactParamsSchema>;

const compileParamsSchema = Type.Object({
  slug: Type.String({ description: "Spec slug in kebab-case." }),
  markdown: Type.Optional(
    Type.String({
      description: "Combined spec markdown. If omitted, tasks.md is read.",
    }),
  ),
});

type CompileParams = Static<typeof compileParamsSchema>;

const statusParamsSchema = Type.Object({
  slug: Type.String({ description: "Spec slug in kebab-case." }),
});

type StatusParams = Static<typeof statusParamsSchema>;

const runtimeUpdateParamsSchema = Type.Object({
  slug: Type.String({ description: "Spec slug in kebab-case." }),
  action: Type.Union([
    Type.Literal("set_phase"),
    Type.Literal("task_started"),
    Type.Literal("task_completed"),
    Type.Literal("commit_skipped"),
    Type.Literal("finding_recorded"),
    Type.Literal("report_written"),
    Type.Literal("aborted"),
  ]),
  phase: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  task_id: Type.Optional(Type.String()),
  reason: Type.Optional(Type.String()),
  changed_files: Type.Optional(Type.Array(Type.String())),
  validation_evidence: Type.Optional(Type.Array(Type.String())),
  finding: Type.Optional(Type.String()),
});

type RuntimeUpdateParams = Static<typeof runtimeUpdateParamsSchema>;

function textResult(text: string, details?: unknown) {
  return { content: [{ type: "text" as const, text }], details };
}

function errorResult(message: string) {
  return textResult(`Error: ${message}`);
}

function artifactSummary(params: { slug?: string; filename?: string }) {
  return `${params.slug ?? "<slug>"}/${params.filename ?? "artifact"}`;
}

async function readCompileMarkdown(
  cwd: string,
  params: CompileParams,
): Promise<string | undefined> {
  if (typeof params.markdown === "string") return params.markdown;
  const target = resolveArtifactPath(cwd, params.slug, "tasks.md");
  if (!target.ok) return undefined;
  try {
    return await readFile(target.absolutePath, "utf8");
  } catch {
    return undefined;
  }
}

function updateRuntime(params: RuntimeUpdateParams, runtime: any) {
  const now = new Date().toISOString();
  switch (params.action) {
    case "set_phase":
      return {
        ...runtime,
        phase: params.phase ?? runtime.phase,
        status: params.status ?? runtime.status,
        updatedAt: now,
      };
    case "task_started":
      return {
        ...runtime,
        tasks: runtime.tasks.map((task: any) =>
          task.id === params.task_id
            ? { ...task, status: "in_progress", attempts: task.attempts + 1 }
            : task,
        ),
        updatedAt: now,
      };
    case "task_completed":
      return {
        ...runtime,
        tasks: runtime.tasks.map((task: any) =>
          task.id === params.task_id ? { ...task, status: "complete" } : task,
        ),
        updatedAt: now,
      };
    case "commit_skipped":
      return {
        ...runtime,
        tasks: runtime.tasks.map((task: any) =>
          task.id === params.task_id
            ? {
                ...task,
                commitSkipped: {
                  reason: params.reason ?? "autoCommitTasks=false",
                  changedFiles: params.changed_files ?? [],
                  validationEvidence: params.validation_evidence ?? [],
                },
              }
            : task,
        ),
        updatedAt: now,
      };
    case "finding_recorded":
      return {
        ...runtime,
        knownIssues: [
          ...runtime.knownIssues,
          params.finding ?? "unspecified finding",
        ],
        updatedAt: now,
      };
    case "report_written":
      return {
        ...runtime,
        phase: "report",
        status: params.status ?? "reported",
        updatedAt: now,
      };
    case "aborted":
      return {
        ...runtime,
        phase: "canceled",
        status: params.reason ?? "canceled",
        updatedAt: now,
      };
  }
}

function eventFor(params: RuntimeUpdateParams) {
  const eventType =
    params.action === "set_phase"
      ? "phase_started"
      : params.action === "aborted"
        ? "aborted"
        : params.action;
  return createEvent(eventType as any, {
    ...(params.phase ? { phase: params.phase } : {}),
    ...(params.task_id ? { taskId: params.task_id } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
    ...(params.finding ? { finding: params.finding } : {}),
  });
}

export function registerSpecWorkflowTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "write_spec_artifact",
    label: "Write Spec Artifact",
    description: "Write a known spec artifact under .specs/<slug>/.",
    promptSnippet: "Write spec workflow artifacts safely under .specs/<slug>/",
    parameters: writeArtifactParamsSchema,
    renderCall(args, theme, context) {
      return renderSpecToolCall(
        "write_spec_artifact",
        artifactSummary(args as any),
        theme,
        context,
      );
    },
    renderResult: renderSpecToolResult,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as WriteArtifactParams;
      const result = await writeArtifact(
        ctx.cwd,
        params.slug,
        params.filename as ArtifactFilename,
        params.content,
      );
      if (!result.ok) return errorResult(result.error);
      return textResult(`Wrote ${result.displayPath}`, result);
    },
  });

  pi.registerTool({
    name: "edit_spec_artifact",
    label: "Edit Spec Artifact",
    description:
      "Apply exact-text edits to a known spec artifact under .specs/<slug>/.",
    promptSnippet: "Edit spec workflow artifacts using exact text replacements",
    parameters: editArtifactParamsSchema,
    renderCall(args, theme, context) {
      return renderSpecToolCall(
        "edit_spec_artifact",
        artifactSummary(args as any),
        theme,
        context,
      );
    },
    renderResult: renderSpecToolResult,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as EditArtifactParams;
      const result = await editArtifact(
        ctx.cwd,
        params.slug,
        params.filename as ArtifactFilename,
        params.edits.map((edit) => ({
          oldText: edit.old_text,
          newText: edit.new_text,
        })),
      );
      if (!result.ok) return errorResult(result.error);
      return textResult(`Edited ${result.displayPath}`, result);
    },
  });

  pi.registerTool({
    name: "compile_spec_runtime",
    label: "Compile Spec Runtime",
    description:
      "Compile spec markdown into validated .specs/<slug>/runtime.json.",
    promptSnippet:
      "Compile markdown spec artifacts into runtime.json before approval/execution",
    parameters: compileParamsSchema,
    renderCall(args, theme, context) {
      return renderSpecToolCall(
        "compile_spec_runtime",
        (args as CompileParams).slug,
        theme,
        context,
      );
    },
    renderResult: renderSpecToolResult,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as CompileParams;
      const markdown = await readCompileMarkdown(ctx.cwd, params);
      if (!markdown)
        return errorResult(
          "markdown is required or .specs/<slug>/tasks.md must exist",
        );
      const currentPath = runtimePathFor(ctx.cwd, params.slug);
      let existing: unknown;
      if (currentPath.ok) {
        try {
          existing = JSON.parse(
            await readFile(currentPath.absolutePath, "utf8"),
          );
        } catch {}
      }
      const compiled = compileSpecRuntime({
        slug: params.slug,
        markdown,
        existingRuntime: existing,
      });
      if (!compiled.ok)
        return errorResult(formatDiagnostics(compiled.diagnostics));
      const written = await writeRuntime(ctx.cwd, compiled.runtime);
      if (!written.ok) return errorResult(written.error);
      return textResult(`Compiled ${written.path}`, compiled.runtime);
    },
  });

  pi.registerTool({
    name: "spec_status",
    label: "Spec Status",
    description: "Read concise status for a compiled spec runtime.",
    promptSnippet: "Check active spec workflow status",
    parameters: statusParamsSchema,
    renderCall(args, theme, context) {
      return renderSpecToolCall(
        "spec_status",
        (args as StatusParams).slug,
        theme,
        context,
      );
    },
    renderResult: renderSpecToolResult,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as StatusParams;
      const result = await readRuntime(ctx.cwd, params.slug);
      if (!result.ok) return errorResult(result.error);
      return textResult(formatStatus(result.runtime), result.runtime);
    },
  });

  pi.registerTool({
    name: "spec_runtime_update",
    label: "Spec Runtime Update",
    description:
      "Apply narrow semantic runtime transitions and append events atomically. Does not accept arbitrary JSON patches.",
    promptSnippet:
      "Record execute/verify/report state transitions in runtime.json and events.jsonl",
    parameters: runtimeUpdateParamsSchema,
    renderCall(args, theme, context) {
      const params = args as RuntimeUpdateParams;
      return renderSpecToolCall(
        "spec_runtime_update",
        `${params.slug} ${params.action}`,
        theme,
        context,
      );
    },
    renderResult: renderSpecToolResult,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as RuntimeUpdateParams;
      if (
        (params.action === "task_started" ||
          params.action === "task_completed" ||
          params.action === "commit_skipped") &&
        !params.task_id
      ) {
        return errorResult("task_id is required for task actions");
      }
      const result = await updateRuntimeWithEvent(
        ctx.cwd,
        params.slug,
        (runtime) => updateRuntime(params, runtime),
        eventFor(params),
      );
      if (!result.ok) return errorResult(result.error);
      return textResult(`Updated ${result.runtimePath}`, result.runtime);
    },
  });
}
