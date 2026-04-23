/**
 * MCP Broker extension for Pi.
 *
 * Registers three meta-tools (mcp_search, mcp_describe, mcp_call) that
 * talk directly to the broker over MCP Streamable HTTP, plus the bash
 * guard that nudges the agent away from native gh/git in favor of
 * mcp_call. Also injects a per-namespace tool menu plus decision rules
 * into the system prompt at agent start so the agent can pick a tool
 * directly without an mcp_search round-trip.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BrokerClient, type BrokerTool } from "./client.ts";
import initGuard from "./guard.ts";
import { registerTools } from "./tools.ts";

export default function (pi: ExtensionAPI) {
  const client = new BrokerClient();

  registerTools(pi, client);
  initGuard(pi, client);

  // Pre-fetch the tool list on session start so the broker prompt menu
  // is ready by the time before_agent_start fires. Silently skip on
  // failure — the meta-tools still work, and the prompt is a nice-to-have.
  pi.on("session_start", async () => {
    try {
      await client.listTools();
    } catch {
      // Broker unreachable or env unset. mcp_search will surface the real
      // error on the first agent call.
    }
  });

  // Inject the broker tool menu and decision rules into the system
  // prompt. Cache-safe: the tools array stays static, and the system
  // prompt is stable within a session.
  pi.on("before_agent_start", async (event) => {
    const tools = client.getCachedTools();
    if (!tools || tools.length === 0) {
      return undefined;
    }
    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildBrokerPrompt(tools)}`,
    };
  });
}

export function buildBrokerPrompt(tools: BrokerTool[]): string {
  const byNamespace = groupByNamespace(tools);
  const menu = Array.from(byNamespace.entries())
    .map(([ns, names]) => `- ${ns}: ${names.join(", ")}`)
    .join("\n");
  return [
    'MCP broker tools (call via mcp_call name="<namespace>.<tool>"):',
    menu,
    "",
    "Use mcp_describe for parameter schemas. Use mcp_search to discover tools by keyword.",
    "For remote git operations (push/pull/fetch/ls-remote/remote) and GitHub work, prefer these broker tools over bash gh/git — bash invocations of gh or remote git typically aren't authenticated in this environment.",
  ].join("\n");
}

function groupByNamespace(tools: BrokerTool[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const tool of tools) {
    const dot = tool.name.indexOf(".");
    if (dot <= 0) continue;
    const ns = tool.name.slice(0, dot);
    const name = tool.name.slice(dot + 1);
    const list = map.get(ns);
    if (list) list.push(name);
    else map.set(ns, [name]);
  }
  for (const list of map.values()) list.sort();
  return new Map(
    Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)),
  );
}
