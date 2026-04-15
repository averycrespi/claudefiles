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
