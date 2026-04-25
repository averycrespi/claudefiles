/**
 * Archived — no longer loaded in the main agent.
 *
 * Why disabled: redundant with Pi's native behavior. Originally adapted from
 * Claude Code after the user observed AGENTS.md drift mid-session, but a later
 * read of pi-coding-agent (≥0.65) shows Pi already pins context files into the
 * system prompt on every turn:
 *
 *   - resource-loader.js loadProjectContextFiles → buildSystemPrompt
 *     embeds AGENTS.md/CLAUDE.md under "# Project Context", plus the current
 *     date and cwd.
 *   - compaction.js summarizes the messages array only — agent.state.systemPrompt
 *     is never touched, so context files survive compaction by construction.
 *
 * That makes this extension pure duplication: same content, also injected every
 * turn, but as a user-role <system-reminder> sitting after the system prompt in
 * the prefix cache. Net effect was extra cached tokens for no behavioral gain.
 *
 * The one capability Pi may not match is mid-session reload on AGENTS.md mtime
 * change. If that ever matters in practice, the right fix is a small
 * file-watcher extension that calls _rebuildSystemPrompt — not full re-injection.
 *
 * Originally: re-injected Pi context files as a hidden <system-reminder> on
 * every LLM call. Mirrored Pi's discovery order (global agent dir, then ancestor
 * dirs from root down to cwd, AGENTS.md preferred over CLAUDE.md). Rebuilt only
 * on mtime/size/date change, prepended as the first user message for
 * prompt-cache stability.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type ContextFile = {
  path: string;
  content: string;
};

export function getAgentDir() {
  const override = process.env.PI_CODING_AGENT_DIR?.trim();
  return override && override.length > 0
    ? resolve(override)
    : join(homedir(), ".pi", "agent");
}

export function loadContextFileFromDir(dir: string): ContextFile | null {
  const candidates = ["AGENTS.md", "CLAUDE.md"];

  for (const filename of candidates) {
    const filePath = join(dir, filename);
    if (!existsSync(filePath)) continue;

    try {
      return {
        path: filePath,
        content: readFileSync(filePath, "utf-8"),
      };
    } catch {
      continue;
    }
  }

  return null;
}

export function discoverContextFiles(cwd: string, agentDir: string) {
  const contextFiles: ContextFile[] = [];
  const seenPaths = new Set<string>();

  const globalContext = loadContextFileFromDir(agentDir);
  if (globalContext) {
    contextFiles.push(globalContext);
    seenPaths.add(globalContext.path);
  }

  const ancestorContextFiles: ContextFile[] = [];
  let currentDir = resolve(cwd);
  const root = resolve("/");

  while (true) {
    const contextFile = loadContextFileFromDir(currentDir);
    if (contextFile && !seenPaths.has(contextFile.path)) {
      ancestorContextFiles.unshift(contextFile);
      seenPaths.add(contextFile.path);
    }

    if (currentDir === root) break;

    const parentDir = resolve(currentDir, "..");
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  contextFiles.push(...ancestorContextFiles);
  return contextFiles;
}

export function getCurrentDate() {
  return new Date().toISOString().slice(0, 10);
}

export function buildFingerprint(files: ContextFile[], currentDate: string) {
  return files
    .map((file) => {
      try {
        const stats = statSync(file.path);
        return `${file.path}:${stats.mtimeMs}:${stats.size}`;
      } catch {
        return `${file.path}:missing`;
      }
    })
    .concat(`date:${currentDate}`)
    .join("|");
}

export function renderReminder(files: ContextFile[], currentDate: string) {
  const sections = files.map(
    (file) =>
      `Contents of ${file.path} (Pi context instructions):\n\n${file.content.trim()}`,
  );

  return [
    "<system-reminder>",
    "As you answer the user's questions, you can use the following context.",
    "Codebase and user instructions are shown below. Be sure to adhere to these instructions.",
    "IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.",
    "",
    "# contextFiles",
    sections.join("\n\n"),
    "",
    "# currentDate",
    `Today's date is ${currentDate}.`,
    "",
    "IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.",
    "</system-reminder>",
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  const agentDir = getAgentDir();

  let lastFingerprint = "";
  let cachedReminder = "";

  function refreshReminder(cwd: string) {
    const files = discoverContextFiles(cwd, agentDir);
    if (files.length === 0) {
      lastFingerprint = "";
      cachedReminder = "";
      return;
    }

    const currentDate = getCurrentDate();
    const fingerprint = buildFingerprint(files, currentDate);
    if (fingerprint === lastFingerprint) return;

    lastFingerprint = fingerprint;
    cachedReminder = renderReminder(files, currentDate);
  }

  pi.on("session_start", async (_event, ctx) => {
    refreshReminder(ctx.cwd);
  });

  pi.on("context", async (event, ctx) => {
    refreshReminder(ctx.cwd);
    if (!cachedReminder) return;

    return {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: cachedReminder }],
          timestamp: Date.now(),
        },
        ...event.messages,
      ],
    };
  });
}
