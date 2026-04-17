/**
 * Web access extension for Pi — provides web_search and web_fetch tools.
 *
 * Setup:
 *   export TAVILY_API_KEY=tvly-...   # recommended for web_search (Jina fallback if unset)
 *                                    # sign up free at https://app.tavily.com (1,000 searches/month)
 *   export JINA_API_KEY=jina_...     # optional — improves rate limits for fetch fallback
 *                                    # sign up free at https://jina.ai
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";
import {
  clearPartialTimer,
  firstLine,
  getResultText,
  headNonEmptyLines,
  partialElapsed,
  plural,
} from "../_shared/render.ts";
import { webFetch } from "./fetch.ts";
import { fetchGitHub, parseGitHubUrl } from "./github.ts";
import { extractPdf } from "./pdf.ts";
import { formatResults, webSearch } from "./search.ts";

// ── Helpers ──────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function isPdfUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith(".pdf");
  } catch {
    return false;
  }
}

// ── web_search ───────────────────────────────────────────────────────

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
    const query = truncate(args?.query ?? "", 80);
    const count =
      args?.num_results != null
        ? ` ${theme.fg("dim", `(${args.num_results})`)}`
        : "";
    return new Text(
      `${theme.fg("toolTitle", theme.bold("web_search"))} ${theme.fg("accent", query)}${count}`,
      0,
      0,
    );
  },

  renderResult(result: any, { isPartial }: any, theme: any, context: any) {
    if (isPartial) {
      const q = truncate(context.args?.query ?? "web", 40);
      return new Text(
        theme.fg("warning", `Searching ${q}...${partialElapsed(context)}`),
        0,
        0,
      );
    }
    clearPartialTimer(context);

    const text = getResultText(result);
    if (context.isError) {
      return new Text(
        theme.fg("error", firstLine(text) || "web_search error"),
        0,
        0,
      );
    }

    // Show first ~3 result titles as head snippet
    const details = result.details as { resultCount?: number } | undefined;
    const count = details?.resultCount ?? 0;
    if (count === 0) {
      return new Text(theme.fg("muted", "No results found"), 0, 0);
    }
    const head = headNonEmptyLines(text, 3)
      .map((line) => truncate(line, 80))
      .join("\n");
    const more = count > 3 ? `\n... +${count - 3} more` : "";
    return new Text(theme.fg("muted", head + more), 0, 0);
  },

  async execute(
    _toolCallId: string,
    params: Static<typeof searchParams>,
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const numResults = Math.max(1, Math.min(params.num_results ?? 5, 10));

    try {
      const response = await webSearch(
        params.query,
        numResults,
        signal ?? AbortSignal.timeout(15_000),
      );
      return {
        content: [{ type: "text" as const, text: formatResults(response) }],
        details: { resultCount: response.results.length },
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        details: {},
      };
    }
  },
};

// ── web_fetch ────────────────────────────────────────────────────────

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
    "Fetch and read the content of a webpage as clean markdown. Use for reading documentation, articles, GitHub READMEs, or any web page where you need the full content. For GitHub repository URLs, clones the repo and returns the README, file tree, and clone path for further exploration.",
  parameters: fetchParams,

  renderCall(args: Static<typeof fetchParams>, theme: any) {
    const url = truncate(args?.url ?? "", 120);
    const chars =
      args?.max_chars != null
        ? ` ${theme.fg("dim", `(${args.max_chars})`)}`
        : "";
    return new Text(
      `${theme.fg("toolTitle", theme.bold("web_fetch"))} ${theme.fg("accent", url)}${chars}`,
      0,
      0,
    );
  },

  renderResult(result: any, { isPartial }: any, theme: any, context: any) {
    if (isPartial) {
      const url = truncate(context.args?.url ?? "page", 50);
      return new Text(
        theme.fg("warning", `Fetching ${url}...${partialElapsed(context)}`),
        0,
        0,
      );
    }
    clearPartialTimer(context);

    const text = getResultText(result);
    if (context.isError) {
      return new Text(
        theme.fg("error", firstLine(text) || "web_fetch error"),
        0,
        0,
      );
    }

    const details = result.details as
      | {
          method?: string;
          clonePath?: string;
          pageCount?: number;
          title?: string;
        }
      | undefined;

    // GitHub clone: show clone path
    if (details?.clonePath) {
      return new Text(
        theme.fg("muted", `Cloned to ${details.clonePath}`),
        0,
        0,
      );
    }

    // PDF: show page count
    if (details?.pageCount) {
      return new Text(
        theme.fg("muted", plural(details.pageCount, "page")),
        0,
        0,
      );
    }

    // Regular fetch: show page title, falling back to first content line
    const title = details?.title;
    const preview = title || firstLine(text);
    return new Text(
      theme.fg(
        "muted",
        preview
          ? truncate(preview, 80)
          : `${text.length.toLocaleString()} chars`,
      ),
      0,
      0,
    );
  },

  async execute(
    _toolCallId: string,
    params: Static<typeof fetchParams>,
    signal: AbortSignal | undefined,
    _onUpdate: unknown,
    _ctx: unknown,
  ) {
    const maxChars = Math.min(params.max_chars ?? 8_000, 32_000);
    const fetchSignal = signal ?? AbortSignal.timeout(20_000);

    try {
      // GitHub URL → clone
      const gh = parseGitHubUrl(params.url);
      if (gh) {
        const result = await fetchGitHub(gh, maxChars);
        return {
          content: [{ type: "text" as const, text: result.text }],
          details: { method: "github", clonePath: result.clonePath },
        };
      }

      // PDF URL → extract text
      if (isPdfUrl(params.url)) {
        const response = await fetch(params.url, {
          signal: fetchSignal,
          headers: { Accept: "application/pdf" },
        });
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
        const buffer = await response.arrayBuffer();
        const pdf = await extractPdf(buffer, maxChars);
        const header = pdf.title ? `# ${pdf.title}\n\n` : "";
        return {
          content: [{ type: "text" as const, text: `${header}${pdf.text}` }],
          details: { method: "pdf", pageCount: pdf.pageCount },
        };
      }

      // Regular URL → Readability + Jina fallback
      const result = await webFetch(params.url, maxChars, fetchSignal);
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: { method: result.method, title: result.title },
      };
    } catch (e: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${e.message}` }],
        details: {},
      };
    }
  },
};

// ── Extension registration ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool(searchTool as any);
  pi.registerTool(fetchTool as any);
}
