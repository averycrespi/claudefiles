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
  parallel<S extends TSchema>(
    specs: DispatchSpec<S>[],
    opts?: { concurrency?: number },
  ): Promise<DispatchResult<S>[]>;
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

    const childCtl = new AbortController();
    const linkAbort = () => childCtl.abort();
    opts.signal?.addEventListener("abort", linkAbort);
    let timedOut = false;
    const timer = spec.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          childCtl.abort();
        }, spec.timeoutMs)
      : null;

    let result: DispatchResult<S>;
    try {
      const outcome = await spawn({
        prompt: spec.prompt,
        toolAllowlist: spec.tools as readonly ToolName[] as any,
        extensionAllowlist: spec.extensions ?? [],
        model: spec.model,
        thinking: spec.thinking,
        cwd: opts.cwd,
        signal: childCtl.signal,
        onEvent: (e) => opts.onSubagentEvent?.(id, e),
      });
      if (!outcome.ok) {
        const reason = timedOut
          ? "timeout"
          : outcome.aborted
            ? "aborted"
            : "dispatch";
        result = {
          ok: false,
          reason,
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
    } finally {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", linkAbort);
    }
    opts.onSubagentLifecycle?.({
      kind: "end",
      id,
      result: result as DispatchResult<TSchema>,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }

  const dispatchWithRetry = async <S extends TSchema>(
    spec: DispatchSpec<S>,
  ): Promise<DispatchResult<S>> => {
    const policy = spec.retry ?? "one-retry-on-dispatch";
    const first = await dispatchOne(spec);
    if (policy === "none" || first.ok || first.reason !== "dispatch")
      return first;
    if (opts.signal?.aborted) return first;
    return dispatchOne({ ...spec, intent: `${spec.intent} (retry)` }, nextId);
  };

  const parallel = async <S extends TSchema>(
    specs: DispatchSpec<S>[],
    parOpts?: { concurrency?: number },
  ): Promise<DispatchResult<S>[]> => {
    const concurrency = parOpts?.concurrency ?? specs.length;
    const results = new Array<DispatchResult<S>>(specs.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= specs.length) return;
        results[i] = await dispatchWithRetry(specs[i]);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.max(1, Math.min(concurrency, specs.length)) },
        () => worker(),
      ),
    );
    return results;
  };

  return { dispatch: dispatchWithRetry, parallel };
}
