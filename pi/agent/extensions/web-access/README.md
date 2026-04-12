# web-access

Web access extension for Pi — provides `web_search` and `web_fetch` tools.

## Tools

### web_search

Search the web for current information. Returns titles, URLs, and relevant snippets.

- **Primary provider**: [Tavily](https://app.tavily.com) (1,000 free searches/month)
- **Fallback**: [Jina Search](https://jina.ai) (works without an API key)

### web_fetch

Fetch and read web content as clean markdown. Intelligently routes by URL type:

- **HTML pages** — local extraction via [Readability](https://github.com/mozilla/readability) + [Turndown](https://github.com/mixmark-io/turndown), with [Jina Reader](https://jina.ai/reader) as fallback for JS-rendered pages
- **GitHub repos** — shallow-clones the repository and returns the README, file tree, and clone path for further exploration with Pi's built-in tools
- **PDFs** — extracts text via [unpdf](https://github.com/unjs/unpdf)

## Setup

```bash
export TAVILY_API_KEY=tvly-...   # recommended for web_search
export JINA_API_KEY=jina_...     # optional — improves Jina rate limits
```

## Inspiration

This extension was informed by exploring these projects:

- [pi-web-access](https://github.com/nicobailon/pi-web-access) — multi-provider search, GitHub cloning, PDF extraction, Readability-based content extraction
- [oh-my-pi](https://github.com/can1357/oh-my-pi) — multi-provider search fallback chains, intelligent content-type routing
