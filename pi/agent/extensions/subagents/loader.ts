import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { AgentDefinition, BuiltinTool } from "./types.js";
import { getAgentDir } from "./utils.js";

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim() === "true";
}

function parseList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFrontmatter(content: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) meta[key] = value;
  }

  return { meta, body: match[2].trim() };
}

export function loadAgents(): AgentDefinition[] {
  const agentsDir = join(getAgentDir(), "agents");

  let entries: string[];
  try {
    entries = readdirSync(agentsDir);
  } catch {
    return [];
  }

  const agents: AgentDefinition[] = [];

  for (const entry of entries.sort()) {
    if (extname(entry) !== ".md") continue;

    let content: string;
    try {
      content = readFileSync(join(agentsDir, entry), "utf8");
    } catch {
      continue;
    }

    const { meta, body } = parseFrontmatter(content);
    if (!body) continue;

    const name = meta.name?.trim() || basename(entry, ".md");
    const description = meta.description?.trim() || name;

    agents.push({
      name,
      description,
      tools: parseList(meta.tools) as BuiltinTool[],
      extensions: parseList(meta.extensions),
      model: meta.model?.trim() || undefined,
      thinking: meta.thinking?.trim() || undefined,
      systemPrompt: body,
      disableSkills: parseBool(meta.disable_skills, false),
      disablePromptTemplates: parseBool(meta.disable_prompt_templates, false),
    });
  }

  return agents;
}
