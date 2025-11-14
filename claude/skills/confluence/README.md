# Confluence Integration Skill

Access Confluence documentation and wiki content directly from Claude Code.

## What It Does

Provides command-line scripts to search for pages and retrieve content from Confluence. Automatically activates when you mention Confluence keywords, URLs, or page IDs.

## Setup

1. Generate an API token:
   - Atlassian Cloud: https://id.atlassian.com/manage-profile/security/api-tokens

2. Set environment variables in your shell profile:
   ```bash
   export CONFLUENCE_DOMAIN="company.atlassian.net"
   export CONFLUENCE_EMAIL="your.email@company.com"
   export CONFLUENCE_API_TOKEN="your-token-here"
   ```

## Bundled Scripts

Located in `scripts/`:
- `confluence-search` - Search for pages using CQL queries (use `--text` for simple text search)
- `confluence-view` - Retrieve page content by ID or URL

## Usage Examples

- "Find documentation about authentication"
- "Show me page 123456789"
- "Search for API guides"
- "What's in this Confluence page: https://..."

## Documentation

See [SKILL.md](SKILL.md) for complete documentation including command syntax, CQL patterns, and advanced workflows.

## Attribution

The Confluence scripts were reverse-engineered from the [confluence-cli](https://github.com/pchuri/confluence-cli) project.
