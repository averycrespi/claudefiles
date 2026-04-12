/**
 * Web content fetching — local Readability extraction with Jina fallback.
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

const JINA_API_KEY = process.env.JINA_API_KEY ?? "";

/** Minimum extracted text length to consider Readability successful. */
const MIN_READABLE_LENGTH = 200;

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export interface FetchResponse {
  text: string;
  title?: string;
  method: "readability" | "jina";
}

/**
 * Fetch a URL and extract readable markdown content.
 * Tries local Readability extraction first, falls back to Jina Reader.
 */
export async function webFetch(
  url: string,
  maxChars: number,
  signal: AbortSignal,
): Promise<FetchResponse> {
  // Try local extraction first
  try {
    const result = await fetchWithReadability(url, maxChars, signal);
    if (result) return result;
  } catch {
    // fall through to Jina
  }

  return fetchWithJina(url, maxChars, signal);
}

async function fetchWithReadability(
  url: string,
  maxChars: number,
  signal: AbortSignal,
): Promise<FetchResponse | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; PiAgent/1.0; +https://github.com/badlogic/pi-mono)",
      Accept: "text/html,application/xhtml+xml,*/*",
    },
    signal,
    redirect: "follow",
  });

  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
    return null;
  }

  const html = await response.text();
  const { document } = parseHTML(html);
  const reader = new Readability(document as any);
  const article = reader.parse();

  if (!article?.content || article.textContent.length < MIN_READABLE_LENGTH) {
    return null;
  }

  let markdown = turndown.turndown(article.content);
  if (markdown.length > maxChars) {
    markdown =
      markdown.slice(0, maxChars) +
      `\n\n[Content truncated — ${markdown.length.toLocaleString()} total characters. Use max_chars to read more.]`;
  }

  return {
    text: markdown,
    title: article.title || undefined,
    method: "readability",
  };
}

async function fetchWithJina(
  url: string,
  maxChars: number,
  signal: AbortSignal,
): Promise<FetchResponse> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const headers: Record<string, string> = {
    Accept: "text/plain",
    "X-Return-Format": "markdown",
    "X-Remove-Selector": "nav, header, footer, aside, .sidebar, .ads",
  };
  if (JINA_API_KEY) {
    headers["Authorization"] = `Bearer ${JINA_API_KEY}`;
  }

  const response = await fetch(jinaUrl, { headers, signal });

  if (!response.ok) {
    throw new Error(`Fetch failed (HTTP ${response.status}): ${url}`);
  }

  let text = await response.text();
  text = text.trim();

  // Extract title before stripping Jina's header block
  const titleMatch = text.match(/^Title: (.+)$/m);
  const title = titleMatch?.[1]?.trim();

  // Strip Jina's header block (URL/Title/Description/URL Source lines)
  text = text.replace(/^(URL Source|URL|Title|Description): .+\n/gm, "").trim();

  if (text.length > maxChars) {
    text =
      text.slice(0, maxChars) +
      `\n\n[Content truncated — ${text.length.toLocaleString()} total characters. Use max_chars to read more.]`;
  }

  return { text, title, method: "jina" };
}
