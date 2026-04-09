/**
 * Re-injects Pi context files as a hidden <system-reminder> on every LLM call.
 *
 * This behavior is adapted from Claude Code. It was added after the user found that
 * the Pi agent was frequently forgetting earlier-loaded context such as AGENTS.md files
 * over the course of a session.
 *
 * This mirrors Pi's built-in AGENTS.md/CLAUDE.md discovery order for parity:
 * global agent dir first, then ancestor directories from filesystem root down to cwd,
 * preferring AGENTS.md over CLAUDE.md within each directory.
 *
 * The reminder is rebuilt only when the discovered files change on disk or the date changes.
 * It is injected through the context hook, so it affects outbound requests without being
 * stored in session history or shown in the UI. This is also relatively token-efficient,
 * since the reminder content stays stable across turns and therefore reuses the prompt
 * cache effectively.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

type ContextFile = {
  path: string;
  content: string;
};

function getAgentDir() {
  const override = process.env.PI_CODING_AGENT_DIR?.trim();
  return override && override.length > 0
    ? resolve(override)
    : join(homedir(), ".pi", "agent");
}

function loadContextFileFromDir(dir: string): ContextFile | null {
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

function discoverContextFiles(cwd: string, agentDir: string) {
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

function getCurrentDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildFingerprint(files: ContextFile[], currentDate: string) {
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

function renderReminder(files: ContextFile[], currentDate: string) {
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
