/**
 * Three Pi tools that wrap the MCP broker:
 *   - mcp_search: list/filter broker tools by name/description substring
 *   - mcp_describe: return full description + input schema for a named tool
 *   - mcp_call: invoke a broker tool with a JSON argument object
 *
 * All three share one BrokerClient via closure so the MCP session is
 * reused across invocations.
 */
import type {
  AgentToolResult,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { BrokerClient, BrokerTool } from "./client.js";

const SEARCH_PARAMS = Type.Object({
  query: Type.String({
    description:
      'Case-insensitive substring to match against tool name and description. Pass empty string "" to list everything.',
  }),
});

const DESCRIBE_PARAMS = Type.Object({
  name: Type.String({
    description: "Exact tool name, e.g. 'github.create_pr'.",
  }),
});

const CALL_PARAMS = Type.Object({
  name: Type.String({
    description: "Exact tool name from mcp_search.",
  }),
  arguments: Type.Object(
    {},
    {
      additionalProperties: true,
      description:
        "Arguments matching the tool's inputSchema. Use mcp_describe to see the schema first.",
    },
  ),
});

function summarize(tool: BrokerTool): string {
  const desc = (tool.description ?? "").split("\n")[0]?.trim() ?? "";
  return desc ? `${tool.name} — ${desc}` : tool.name;
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: {},
  };
}

export function registerTools(pi: ExtensionAPI, client: BrokerClient): void {
  pi.registerTool({
    name: "mcp_search",
    label: "MCP Search",
    description:
      "Search tools exposed by the MCP broker. Tool names follow <provider>.<tool>. Pass a substring query to filter by name or description, or an empty string to list everything.",
    parameters: SEARCH_PARAMS,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      let tools: BrokerTool[];
      try {
        tools = await client.listTools();
      } catch (err) {
        return errorResult(
          `mcp_search failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const q = params.query.trim().toLowerCase();
      const matches = q
        ? tools.filter((t) => {
            const name = t.name.toLowerCase();
            const desc = (t.description ?? "").toLowerCase();
            return name.includes(q) || desc.includes(q);
          })
        : tools;
      const text = matches.length
        ? matches.map(summarize).join("\n")
        : `No broker tools match "${params.query}".`;
      return {
        content: [{ type: "text" as const, text }],
        details: { matchCount: matches.length, totalCount: tools.length },
      };
    },
  });

  pi.registerTool({
    name: "mcp_describe",
    label: "MCP Describe",
    description:
      "Return the full description and JSON Schema input for a named broker tool. Use mcp_search first to discover names.",
    parameters: DESCRIBE_PARAMS,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      let tools: BrokerTool[];
      try {
        tools = await client.listTools();
      } catch (err) {
        return errorResult(
          `mcp_describe failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) {
        return errorResult(
          `No broker tool named "${params.name}". Run mcp_search to find available tools.`,
        );
      }
      const schemaJson = JSON.stringify(tool.inputSchema ?? {}, null, 2);
      const text = [
        `Tool: ${tool.name}`,
        "",
        tool.description ?? "(no description)",
        "",
        "Input schema:",
        "```json",
        schemaJson,
        "```",
      ].join("\n");
      return {
        content: [{ type: "text" as const, text }],
        details: { name: tool.name },
      };
    },
  });

  pi.registerTool({
    name: "mcp_call",
    label: "MCP Call",
    description:
      "Invoke a broker tool. Use mcp_describe to learn the input schema first. Calls that need human approval block for up to 10 minutes.",
    parameters: CALL_PARAMS,
    async execute(_id, params, signal, _onUpdate, _ctx) {
      const sig = signal ?? new AbortController().signal;
      try {
        const result = await client.callTool(
          params.name,
          params.arguments,
          sig,
        );
        const content = (result.content ??
          []) as AgentToolResult<unknown>["content"];
        if (result.isError) {
          content.unshift({
            type: "text" as const,
            text: `[mcp_call: broker tool '${params.name}' reported an error]`,
          });
        }
        return { content, details: { name: params.name } };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        const message = err instanceof Error ? err.message : String(err);
        const looksLikeSession = /session/i.test(message);
        if (looksLikeSession) {
          client.reset();
          try {
            const retried = await client.callTool(
              params.name,
              params.arguments,
              sig,
            );
            const retriedContent = (retried.content ??
              []) as AgentToolResult<unknown>["content"];
            if (retried.isError) {
              retriedContent.unshift({
                type: "text" as const,
                text: `[mcp_call: broker tool '${params.name}' reported an error]`,
              });
            }
            return {
              content: retriedContent,
              details: { name: params.name, retried: true },
            };
          } catch (retryErr) {
            const retryMsg =
              retryErr instanceof Error ? retryErr.message : String(retryErr);
            return errorResult(
              `mcp_call failed after session retry: ${retryMsg}`,
            );
          }
        }
        return errorResult(`mcp_call failed: ${message}`);
      }
    },
  });
}
