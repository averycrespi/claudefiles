import { spawnSubagent } from "../../subagents/index.js";

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
}

export interface DispatchResult {
  ok: boolean;
  stdout: string;
  error?: string;
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
  });
  if (!outcome.ok) {
    return {
      ok: false,
      stdout: outcome.stdout,
      error: outcome.errorMessage ?? `exit ${outcome.exitCode}`,
    };
  }
  return { ok: true, stdout: outcome.stdout };
}
