/**
 * Web search providers — Tavily (primary) with Jina Search fallback.
 */

export interface SearchResult {
  title: string;
  url: string;
  date?: string;
  snippet: string;
}

export interface SearchResponse {
  results: SearchResult[];
  provider: string;
}

const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";
const JINA_API_KEY = process.env.JINA_API_KEY ?? "";

async function searchTavily(
  query: string,
  numResults: number,
  signal: AbortSignal,
): Promise<SearchResponse> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      max_results: numResults,
      include_answer: false,
      include_raw_content: false,
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Tavily HTTP ${response.status}: ${body}`);
  }

  const data = await response.json();
  if (!data.results?.length) return { results: [], provider: "tavily" };

  return {
    results: data.results.map((r: any) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      date: r.published_date,
      snippet: r.content?.trim() ?? "",
    })),
    provider: "tavily",
  };
}

async function searchJina(
  query: string,
  numResults: number,
  signal: AbortSignal,
): Promise<SearchResponse> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Retain-Images": "none",
  };
  if (JINA_API_KEY) {
    headers["Authorization"] = `Bearer ${JINA_API_KEY}`;
  }

  const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers, signal });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Jina Search HTTP ${response.status}: ${body}`);
  }

  const data = await response.json();
  const items: any[] = data.data ?? [];

  return {
    results: items.slice(0, numResults).map((r: any) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: r.description?.trim() ?? r.content?.trim()?.slice(0, 300) ?? "",
    })),
    provider: "jina",
  };
}

/**
 * Search the web. Tries Tavily first; falls back to Jina Search on
 * failure or when TAVILY_API_KEY is not set.
 */
export async function webSearch(
  query: string,
  numResults: number,
  signal: AbortSignal,
): Promise<SearchResponse> {
  if (TAVILY_API_KEY) {
    try {
      return await searchTavily(query, numResults, signal);
    } catch {
      // fall through to Jina
    }
  }
  return searchJina(query, numResults, signal);
}

/** Format search results as markdown for the model. */
export function formatResults(response: SearchResponse): string {
  if (response.results.length === 0) return "No results found.";
  return response.results
    .map((r, i) => {
      const date = r.date ? ` · ${r.date}` : "";
      return `${i + 1}. **${r.title}**${date}\n   ${r.url}\n   ${r.snippet}`;
    })
    .join("\n\n");
}
