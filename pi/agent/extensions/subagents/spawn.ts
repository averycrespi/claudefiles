import { spawn } from "node:child_process";
import {
  MAX_SUBAGENT_DEPTH,
  type BuiltinTool,
  type InheritSession,
} from "./types.js";
import { resolveExtensionAllowlist } from "./utils.js";

export const PI_BINARY = "pi";

export interface SpawnInvocation {
  prompt: string;
  toolAllowlist: BuiltinTool[];
  extensionAllowlist: string[];
  files?: string[];
  model?: string;
  thinking?: string;
  systemPrompt?: string;
  inheritSession?: InheritSession;
  maxDepth?: number;
  parentSessionFile?: string;
  disableSkills?: boolean;
  disablePromptTemplates?: boolean;
  cwd: string;
  signal?: AbortSignal;
  onEvent?: (event: unknown) => void;
}

export interface SpawnOutcome {
  ok: boolean;
  aborted: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  errorMessage?: string;
}

function getCurrentDepth(): number {
  const raw = process.env.PI_SUBAGENT_DEPTH;
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function clampMaxDepth(value: number | undefined): number {
  const requested = value ?? 1;
  return Math.max(1, Math.min(requested, MAX_SUBAGENT_DEPTH));
}

function uniqueTools(tools: BuiltinTool[]): BuiltinTool[] {
  return [...new Set(tools)];
}

function buildArgs(params: {
  prompt: string;
  tools: BuiltinTool[];
  extensions: string[];
  files: string[];
  model?: string;
  thinking?: string;
  systemPrompt?: string;
  inheritSession: InheritSession;
  parentSessionFile?: string;
  disableSkills?: boolean;
  disablePromptTemplates?: boolean;
}): string[] {
  const args: string[] = ["--mode", "json", "-p"];

  if (params.inheritSession === "fork") {
    if (!params.parentSessionFile) {
      throw new Error("inherit_session=fork requires a parent session file");
    }
    args.push("--fork", params.parentSessionFile);
  } else {
    args.push("--no-session");
  }

  if (params.model) args.push("--model", params.model);
  if (params.thinking) args.push("--thinking", params.thinking);

  if (params.tools.length > 0) {
    args.push("--tools", uniqueTools(params.tools).join(","));
  } else {
    args.push("--no-tools");
  }

  if (params.disableSkills) args.push("--no-skills");
  if (params.disablePromptTemplates) args.push("--no-prompt-templates");
  if (params.systemPrompt?.trim()) {
    args.push("--append-system-prompt", params.systemPrompt.trim());
  }

  if (params.extensions.length > 0) {
    args.push("--no-extensions");
    for (const extensionPath of params.extensions) {
      args.push("-e", extensionPath);
    }
  }

  for (const file of params.files) {
    args.push(`@${file}`);
  }

  args.push(params.prompt);
  return args;
}

function extractTextFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const record = message as { content?: unknown };
  if (typeof record.content === "string") return record.content.trim();
  if (!Array.isArray(record.content)) return "";

  const parts: string[] = [];
  for (const block of record.content) {
    if (!block || typeof block !== "object") continue;
    const item = block as { type?: string; text?: unknown };
    if (item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  return parts.join("").trim();
}

function reduceJsonLine(
  rawLine: string,
  onEvent: ((event: unknown) => void) | undefined,
  currentText: string,
): string {
  const line = rawLine.trim();
  if (!line) return currentText;

  try {
    const event = JSON.parse(line) as { type?: string; [key: string]: unknown };
    if (event.type !== "session") {
      onEvent?.(event);
    }

    if (event.type === "message_end") {
      return extractTextFromMessage(event.message) || currentText;
    }

    if (event.type === "agent_end") {
      const messages = event.messages;
      if (Array.isArray(messages)) {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const message = messages[i] as { role?: unknown } | undefined;
          if (message?.role === "assistant") {
            const text = extractTextFromMessage(message);
            if (text) return text;
          }
        }
      }
    }
  } catch {
    // Ignore non-JSON noise and leave it to stderr / completion handling.
  }

  return currentText;
}

async function runSpawn(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
  onEvent?: (event: unknown) => void,
): Promise<SpawnOutcome> {
  return await new Promise<SpawnOutcome>((resolve) => {
    let finished = false;
    let aborted = Boolean(signal?.aborted);
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let finalText = "";
    let child: ReturnType<typeof spawn> | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const finish = (outcome: SpawnOutcome) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", onAbort);
      if (killTimer) clearTimeout(killTimer);
      resolve(outcome);
    };

    const onAbort = () => {
      aborted = true;
      child?.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child?.kill("SIGKILL");
      }, 2_000);
    };

    if (signal?.aborted) {
      return finish({
        ok: false,
        aborted: true,
        stdout: "",
        stderr: "",
        exitCode: null,
        signal: null,
        errorMessage: "aborted before spawn",
      });
    }

    child = spawn(PI_BINARY, args, {
      cwd,
      env: {
        ...process.env,
        PI_SUBAGENT_DEPTH: String(getCurrentDepth() + 1),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child?.on("error", (error: NodeJS.ErrnoException) => {
      finish({
        ok: false,
        aborted,
        stdout: finalText,
        stderr: stderrBuffer,
        exitCode: null,
        signal: null,
        errorMessage: error.message,
      });
    });

    child?.stdout?.setEncoding("utf8");
    child?.stdout?.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const rawLine = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        finalText = reduceJsonLine(rawLine, onEvent, finalText);
        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });

    child?.stderr?.setEncoding("utf8");
    let stderrLineBuffer = "";
    child?.stderr?.on("data", (chunk: string) => {
      stderrBuffer += chunk;
      stderrLineBuffer += chunk;
      let newlineIndex = stderrLineBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stderrLineBuffer.slice(0, newlineIndex).trim();
        stderrLineBuffer = stderrLineBuffer.slice(newlineIndex + 1);
        if (line) onEvent?.({ type: "stderr", text: line });
        newlineIndex = stderrLineBuffer.indexOf("\n");
      }
    });

    child?.on("close", (code, sig) => {
      if (stdoutBuffer.trim()) {
        finalText = reduceJsonLine(stdoutBuffer, onEvent, finalText);
        stdoutBuffer = "";
      }

      const ok = code === 0 && !aborted;
      finish({
        ok,
        aborted,
        stdout: finalText,
        stderr: stderrBuffer,
        exitCode: code,
        signal: sig,
        errorMessage: ok
          ? undefined
          : `subagent exited with code ${code ?? "unknown"}`,
      });
    });

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function spawnSubagent(
  options: SpawnInvocation,
): Promise<SpawnOutcome> {
  const maxDepth = clampMaxDepth(options.maxDepth);
  const currentDepth = getCurrentDepth();

  if (currentDepth >= maxDepth) {
    return {
      ok: false,
      aborted: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      errorMessage: `subagent depth limit exceeded (max ${maxDepth})`,
    };
  }

  const effectiveSession = options.inheritSession ?? "none";
  const extensions = await resolveExtensionAllowlist(
    options.extensionAllowlist,
    options.cwd,
  );

  if (options.extensionAllowlist.length > 0 && extensions.length === 0) {
    return {
      ok: false,
      aborted: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      errorMessage: `no matching extensions found for: ${options.extensionAllowlist.join(", ")}`,
    };
  }

  let args: string[];
  try {
    args = buildArgs({
      prompt: options.prompt,
      tools: options.toolAllowlist,
      extensions,
      files: options.files ?? [],
      model: options.model,
      thinking: options.thinking,
      systemPrompt: options.systemPrompt,
      inheritSession: effectiveSession,
      parentSessionFile: options.parentSessionFile,
      disableSkills: options.disableSkills,
      disablePromptTemplates: options.disablePromptTemplates,
    });
  } catch (error: any) {
    return {
      ok: false,
      aborted: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      errorMessage: error?.message ?? String(error),
    };
  }

  return await runSpawn(args, options.cwd, options.signal, options.onEvent);
}

export function formatSpawnFailure(outcome: SpawnOutcome): string {
  if (outcome.aborted) return "Error: subagent aborted";

  const lines = [`Error: ${outcome.errorMessage ?? "subagent failed"}`];
  if (outcome.exitCode != null) lines.push(`Exit code: ${outcome.exitCode}`);
  if (outcome.stderr.trim()) lines.push("stderr:", outcome.stderr.trimEnd());
  if (outcome.stdout.trim()) lines.push("stdout:", outcome.stdout.trimEnd());
  return lines.join("\n");
}
