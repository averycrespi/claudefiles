import type { TSchema } from "@sinclair/typebox";
import {
  spawnSubagent,
  type SpawnOutcome,
  type SpawnInvocation,
} from "../../subagents/api.ts";
import { parseJsonReport } from "./parse.ts";
import type { DispatchResult, DispatchSpec, ToolName } from "./types.ts";

export interface Subagent {
  dispatch<S extends TSchema>(
    spec: DispatchSpec<S>,
  ): Promise<DispatchResult<S>>;
}

export interface CreateSubagentOpts {
  cwd: string;
  spawn?: (inv: SpawnInvocation) => Promise<SpawnOutcome>;
  signal?: AbortSignal;
  onSubagentEvent?: (id: number, event: unknown) => void;
  onSubagentLifecycle?: (
    event:
      | {
          kind: "start";
          id: number;
          spec: DispatchSpec<TSchema>;
          parentId?: number;
        }
      | {
          kind: "end";
          id: number;
          result: DispatchResult<TSchema>;
          durationMs: number;
        },
  ) => void;
}

export function createSubagent(opts: CreateSubagentOpts): Subagent {
  const spawn = opts.spawn ?? spawnSubagent;
  let nextId = 0;

  async function dispatchOne<S extends TSchema>(
    spec: DispatchSpec<S>,
    parentId?: number,
  ): Promise<DispatchResult<S>> {
    const id = ++nextId;
    const startedAt = Date.now();
    opts.onSubagentLifecycle?.({ kind: "start", id, spec, parentId });
    const outcome = await spawn({
      prompt: spec.prompt,
      toolAllowlist: spec.tools as readonly ToolName[] as any,
      extensionAllowlist: spec.extensions ?? [],
      model: spec.model,
      thinking: spec.thinking,
      cwd: opts.cwd,
      signal: opts.signal,
      onEvent: (e) => opts.onSubagentEvent?.(id, e),
    });
    let result: DispatchResult<S>;
    if (!outcome.ok) {
      result = {
        ok: false,
        reason: outcome.aborted ? "aborted" : "dispatch",
        error: outcome.errorMessage ?? `exit ${outcome.exitCode}`,
        raw: outcome.stdout,
      };
    } else {
      const parsed = parseJsonReport(outcome.stdout, spec.schema);
      if (parsed.ok) {
        result = { ok: true, data: parsed.data, raw: outcome.stdout };
      } else {
        const reason = parsed.error.startsWith("JSON parse")
          ? "parse"
          : "schema";
        result = {
          ok: false,
          reason,
          error: parsed.error,
          raw: outcome.stdout,
        };
      }
    }
    opts.onSubagentLifecycle?.({
      kind: "end",
      id,
      result: result as DispatchResult<TSchema>,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }

  return {
    dispatch: async (spec) => {
      const policy = spec.retry ?? "one-retry-on-dispatch";
      const first = await dispatchOne(spec);
      if (policy === "none") return first;
      if (first.ok) return first;
      if (first.reason !== "dispatch") return first;
      if (opts.signal?.aborted) return first;
      return dispatchOne(
        { ...spec, intent: `${spec.intent} (retry)` },
        // parent_id wiring: we use the running id counter; the previous
        // dispatch reserved nextId-1.
        nextId,
      );
    },
  };
}
