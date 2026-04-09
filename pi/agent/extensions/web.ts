/**
 * Web extension for Pi — provides web_search and web_fetch tools.
 *
 * Setup:
 *   export TAVILY_API_KEY=tvly-...   # required for web_search
 *                                    # sign up free at https://app.tavily.com (1,000 searches/month)
 *   export JINA_API_KEY=jina_...     # optional for web_fetch — improves rate limits
 *                                    # sign up free at https://jina.ai
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";

function truncate(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function getTextContent(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  const textContent = result.content.find((content) => content.type === "text");
  return textContent?.type === "text" ? (textContent.text ?? "") : "";
}

function getResultCount(text: string) {
  if (!text.trim() || text === "No results found.") return 0;
  return text.split("\n\n").filter(Boolean).length;
}

const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";
const JINA_API_KEY = process.env.JINA_API_KEY ?? "";

const searchParams = Type.Object({
  query: Type.String({ description: "Search query" }),
  num_results: Type.Optional(
    Type.Number({
      description: "Number of results to return (1–10, default 5)",
    }),
  ),
});

const searchTool = {
  name: "web_search",
  label: "Web Search",
  description:
    "Search the web for current information. Returns titles, URLs, and relevant snippets. Use for finding documentation, recent news, answers to factual questions, or anything requiring up-to-date information.",
  parameters: searchParams,
  renderCall(args: Static<typeof searchParams>, theme: any) {
    const query = truncate(args.query, 80);
    const count = args.num_results != null ? ` (${args.num_results})` : "";
    return new Text(
      `${theme.fg("toolTitle", theme.bold("web_search"))} ${theme.fg("accent", query)}${theme.fg("dim", count)}`,
      0,
      0,
    );
  },
  renderResult(
    result: { content: Array<{ type: string; text?: string }> },
    { isPartial }: { isPartial: boolean },
    theme: any,
  ) {
    if (isPartial) {
      return new Text(theme.fg("warning", "Searching..."), 0, 0);
    }

    const text = getTextContent(result);
    if (text.startsWith("Error:") || text.startsWith("Search ")) {
      return new Text(theme.fg("error", text.split("\n")[0]), 0, 0);
    }

    const count = getResultCount(text);
    const label = count === 1 ? "1 result" : `${count} results`;
    return new Text(theme.fg("success", label), 0, 0);
  },
  execute: async (
    _toolCallId: string,
    params: Static<typeof searchParams>,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) => {
    if (!TAVILY_API_KEY) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: TAVILY_API_KEY is not set. Sign up for a free API key at https://app.tavily.com",
          },
        ],
        details: {},
      };
    }

    const numResults = Math.max(1, Math.min(params.num_results ?? 5, 10));

    let response: Response;
    try {
      response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query: params.query,
          max_results: numResults,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Search request failed: ${e.message}`,
          },
        ],
        details: {},
      };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        content: [
          {
            type: "text" as const,
            text: `Search failed (HTTP ${response.status}): ${body}`,
          },
        ],
        details: {},
      };
    }

    const data = await response.json();

    if (!data.results?.length) {
      return {
        content: [{ type: "text" as const, text: "No results found." }],
        details: {},
      };
    }

    const lines: string[] = data.results.map((r: any, i: number) => {
      const date = r.published_date ? ` · ${r.published_date}` : "";
      const snippet = r.content?.trim() ?? "";
      return `${i + 1}. **${r.title}**${date}\n   ${r.url}\n   ${snippet}`;
    });

    return {
      content: [{ type: "text" as const, text: lines.join("\n\n") }],
      details: {},
    };
  },
};

const fetchParams = Type.Object({
  url: Type.String({ description: "Full URL to fetch (include https://)" }),
  max_chars: Type.Optional(
    Type.Number({
      description: "Maximum characters to return (default 8000, max 32000)",
    }),
  ),
});

const fetchTool = {
  name: "web_fetch",
  label: "Web Fetch",
  description:
    "Fetch and read the content of a webpage as clean markdown. Use for reading documentation, articles, GitHub READMEs, or any web page where you need the full content.",
  parameters: fetchParams,
  renderCall(args: Static<typeof fetchParams>, theme: any) {
    const target = truncate(args.url, 120);
    const count = args.max_chars != null ? ` (${args.max_chars})` : "";
    return new Text(
      `${theme.fg("toolTitle", theme.bold("web_fetch"))} ${theme.fg("accent", target)}${theme.fg("dim", count)}`,
      0,
      0,
    );
  },
  renderResult(
    result: { content: Array<{ type: string; text?: string }> },
    { isPartial }: { isPartial: boolean },
    theme: any,
  ) {
    if (isPartial) {
      return new Text(theme.fg("warning", "Fetching..."), 0, 0);
    }

    const text = getTextContent(result);
    if (text.startsWith("Error:") || text.startsWith("Fetch ")) {
      return new Text(theme.fg("error", text.split("\n")[0]), 0, 0);
    }

    return new Text(
      theme.fg("success", `${text.length.toLocaleString()} chars`),
      0,
      0,
    );
  },
  execute: async (
    _toolCallId: string,
    params: Static<typeof fetchParams>,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) => {
    const maxChars = Math.min(params.max_chars ?? 8_000, 32_000);
    const jinaUrl = `https://r.jina.ai/${params.url}`;

    const headers: Record<string, string> = {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
      "X-Remove-Selector": "nav, header, footer, aside, .sidebar, .ads",
    };
    if (JINA_API_KEY) {
      headers["Authorization"] = `Bearer ${JINA_API_KEY}`;
    }

    let response: Response;
    try {
      response = await fetch(jinaUrl, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      return {
        content: [
          { type: "text" as const, text: `Fetch request failed: ${e.message}` },
        ],
        details: {},
      };
    }

    if (!response.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Fetch failed (HTTP ${response.status}): ${params.url}`,
          },
        ],
        details: {},
      };
    }

    let text = await response.text();
    text = text.trim();

    // Strip Jina's header block (URL/title/description lines it prepends)
    text = text.replace(/^(URL|Title|Description): .+\n/gm, "").trim();

    if (text.length > maxChars) {
      text =
        text.slice(0, maxChars) +
        `\n\n[Content truncated — ${text.length.toLocaleString()} total characters. Use max_chars to read more.]`;
    }

    return { content: [{ type: "text" as const, text }], details: {} };
  },
};

export default function (pi: ExtensionAPI) {
  pi.registerTool(searchTool);
  pi.registerTool(fetchTool);
}
