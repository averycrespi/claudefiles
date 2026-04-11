/**
 * MCP client wrapper for the broker.
 *
 * Owns a single long-lived MCP client connection to the broker over
 * Streamable HTTP. Lazy-connects on first use, caches the fetched tool
 * list (so provider namespaces and schemas can be read without a round
 * trip on every call), and exposes a small surface consumed by tools.ts
 * and the namespace-hint hook in index.ts.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

export type BrokerTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export class BrokerClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private cachedTools: BrokerTool[] | null = null;
  private cachedProviders: string[] | null = null;

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    const endpoint = process.env.MCP_BROKER_ENDPOINT;
    const token = process.env.MCP_BROKER_AUTH_TOKEN;
    if (!endpoint || !token) {
      throw new Error(
        "broker endpoint not configured — set MCP_BROKER_ENDPOINT and MCP_BROKER_AUTH_TOKEN",
      );
    }

    this.connecting = (async () => {
      const transport = new StreamableHTTPClientTransport(
        new URL(`${endpoint}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      );
      const client = new Client(
        { name: "pi-mcp-broker", version: "0.1.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      this.client = client;
      return client;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async listTools(): Promise<BrokerTool[]> {
    const client = await this.getClient();
    const result = await client.listTools();
    const tools: BrokerTool[] = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    this.cachedTools = tools;
    this.cachedProviders = extractProviders(tools);
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    const client = await this.getClient();
    return client.callTool({ name, arguments: args }, undefined, {
      signal,
      timeout: APPROVAL_TIMEOUT_MS,
    });
  }

  /** Return cached tools without a network call. Populated by listTools. */
  getCachedTools(): BrokerTool[] | null {
    return this.cachedTools;
  }

  /** Return cached provider namespaces without a network call. */
  getCachedProviders(): string[] | null {
    return this.cachedProviders;
  }

  /** Drop the current client so the next call reconnects. */
  reset(): void {
    this.client = null;
    this.cachedTools = null;
    this.cachedProviders = null;
  }
}

function extractProviders(tools: BrokerTool[]): string[] {
  const set = new Set<string>();
  for (const tool of tools) {
    const dot = tool.name.indexOf(".");
    if (dot > 0) set.add(tool.name.slice(0, dot));
  }
  return Array.from(set).sort();
}
