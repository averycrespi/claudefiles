/**
 * MCP Broker extension for Pi.
 *
 * Registers three meta-tools (mcp_search, mcp_describe, mcp_call) that
 * talk directly to the broker over MCP Streamable HTTP, plus the bash
 * guard that steers the agent away from native gh/git in favor of
 * mcp_call. Also injects a one-line namespace hint into the system
 * prompt at agent start so the agent sees the live set of provider
 * prefixes without having to probe.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BrokerClient } from "./client.js";
import initGuard from "./guard.js";
import { registerTools } from "./tools.js";

export default function (pi: ExtensionAPI) {
  const client = new BrokerClient();

  registerTools(pi, client);
  initGuard(pi);

  // Pre-fetch the tool list on session start so the namespace hint is
  // ready by the time before_agent_start fires. Silently skip on
  // failure — the meta-tools still work, and the hint is a nice-to-have.
  pi.on("session_start", async () => {
    try {
      await client.listTools();
    } catch {
      // Broker unreachable or env unset. mcp_search will surface the real
      // error on the first agent call.
    }
  });

  // Inject the namespace hint into the system prompt. This is the
  // cache-safe place for session-scoped dynamic context: the tools array
  // stays static, and the system prompt is stable within a session.
  pi.on("before_agent_start", async (event) => {
    const providers = client.getCachedProviders();
    if (!providers || providers.length === 0) {
      return undefined;
    }
    const hint = [
      `The MCP broker currently exposes tools in these namespaces: ${providers.join(", ")}.`,
      "Use mcp_search to find specific tools; tool names follow <namespace>.<tool>.",
    ].join("\n");
    return {
      systemPrompt: `${event.systemPrompt}\n\n${hint}`,
    };
  });
}
