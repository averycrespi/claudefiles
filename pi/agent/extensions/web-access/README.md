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

## Configuration

Configure via `extension:web-access` in Pi settings. Environment variables override settings when set.

| Field          | Default | Environment override | Description                                                                                                                  |
| -------------- | ------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `tavilyApiKey` | unset   | `TAVILY_API_KEY`     | Recommended for `web_search`; when absent, `web_search` falls back to Jina Search.                                           |
| `jinaApiKey`   | unset   | `JINA_API_KEY`       | Optional; improves Jina rate limits. When absent, Jina-backed search/fetch still works where anonymous rate limits allow it. |

Example settings:

```json
{
  "extension:web-access": {
    "tavilyApiKey": "tvly-...",
    "jinaApiKey": "jina_..."
  }
}
```

## Temporary files

For GitHub repository URLs, `web_fetch` shallow-clones the repository to `/tmp/pi-github-repos/<owner>/<repo>` and returns that clone path for follow-up exploration with Pi's built-in tools. If the clone already exists and contains a `.git` directory, it is reused. Clones are not actively cleaned up by the extension.

## Logging

This extension does not write retained logs or diagnostic files.

## Inspiration

This extension was informed by exploring these projects:

- [pi-web-access](https://github.com/nicobailon/pi-web-access) — multi-provider search, GitHub cloning, PDF extraction, Readability-based content extraction
- [oh-my-pi](https://github.com/can1357/oh-my-pi) — multi-provider search fallback chains, intelligent content-type routing
