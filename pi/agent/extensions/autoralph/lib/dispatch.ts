import { spawnSubagent } from "../../subagents/api.ts";

export interface DispatchOptions {
  prompt: string;
  systemPrompt?: string;
  tools: ReadonlyArray<
    "read" | "write" | "edit" | "bash" | "ls" | "find" | "grep"
  >;
  extensions?: string[];
  model?: string;
  thinking?: "low" | "medium" | "high";
  signal?: AbortSignal;
  cwd: string;
  /** Short label shown in the status widget while this subagent runs. */
  intent?: string;
  /** Raw event stream forwarded from the Pi subagent process. */
  onEvent?: (event: unknown) => void;
  /** Extra environment variables forwarded to the subagent process. */
  env?: Record<string, string>;
}

export interface DispatchResult {
  ok: boolean;
  stdout: string;
  error?: string;
  aborted?: boolean;
}

export async function dispatch(opts: DispatchOptions): Promise<DispatchResult> {
  const outcome = await spawnSubagent({
    prompt: opts.prompt,
    systemPrompt: opts.systemPrompt,
    toolAllowlist: opts.tools as any,
    extensionAllowlist: opts.extensions ?? [],
    model: opts.model,
    thinking: opts.thinking,
    cwd: opts.cwd,
    signal: opts.signal,
    onEvent: opts.onEvent,
    env: opts.env,
  });
  if (!outcome.ok) {
    return {
      ok: false,
      stdout: outcome.stdout,
      error: outcome.errorMessage ?? `exit ${outcome.exitCode}`,
      aborted: outcome.aborted,
    };
  }
  return { ok: true, stdout: outcome.stdout };
}

export type DispatchFn = (opts: DispatchOptions) => Promise<DispatchResult>;

/**
 * Dispatch, and if the dispatch itself fails for a transient reason,
 * retry exactly once with `(retry)` appended to the intent. Retries are
 * opt-in — callers at boundaries with low blast radius (reviewers,
 * validation, fixers) should use plain `dispatch` and degrade gracefully
 * instead.
 *
 * Guards (never retry when any is true):
 *   - first attempt was aborted (user cancel reached the subagent)
 *   - caller's run signal is already aborted
 *   - first attempt returned ok: true (parse/semantic failures inside a
 *     valid response are the caller's problem, not ours)
 *
 * Bounded at exactly one retry: at most 2 dispatches total. When the
 * retry succeeds, `firstError` carries the transient error so callers
 * can surface it; when it fails, the second result is returned
 * unchanged and the first error is dropped (the final failure is what
 * the user sees).
 */
export async function dispatchWithOneRetry(
  dispatch: DispatchFn,
  opts: DispatchOptions,
  runSignal?: AbortSignal,
): Promise<DispatchResult & { firstError?: string }> {
  const first = await dispatch(opts);
  if (first.ok) return first;
  if (first.aborted) return first;
  if (runSignal?.aborted) return first;
  const retryIntent = opts.intent ? `${opts.intent} (retry)` : undefined;
  const second = await dispatch({ ...opts, intent: retryIntent });
  if (second.ok) return { ...second, firstError: first.error };
  return second;
}
