---
name: confluence
description: |
  This skill should be used when the user mentions Confluence, references Confluence page URLs,
  asks to search for documentation, or needs to view Confluence content. Activates on keywords like
  "Confluence", "wiki", "documentation", Confluence URLs, or numeric page IDs in Confluence context.
  Provides read-only access to Confluence via command-line search and view scripts.
---

# Confluence Integration Skill

## Purpose

Transparently integrate Confluence content into development discussions by providing search and content retrieval capabilities through command-line scripts. Enable seamless access to wiki pages, documentation, and knowledge base articles without leaving the development environment.

## When to Use This Skill

Activate this skill when detecting:

- **Confluence keywords**: "confluence", "wiki", "documentation", "knowledge base", "internal docs"
- **Confluence URLs**: Any URL containing `atlassian.net/wiki`, `/viewpage.action`, `/pages/`, or similar Confluence patterns
- **Page references**: Numeric page IDs mentioned in Confluence context
- **Search requests**: "Find documentation about...", "Search for...", "Look up..."
- **Documentation queries**: Questions about internal processes, architecture, onboarding, or standards

## How to Use This Skill

The Confluence scripts are located in `~/.claude/skills/confluence/scripts/`:
- `~/.claude/skills/confluence/scripts/confluence-search` - Search for Confluence pages
- `~/.claude/skills/confluence/scripts/confluence-view` - View specific Confluence page by ID or URL

### Search: `confluence-search`

Search Confluence for pages using text search (default) or full CQL (Confluence Query Language) queries.

**Basic text search** (default):
```bash
confluence-search "query text"
```

**Advanced CQL queries** (with `--cql` flag):
```bash
# Search in specific space
confluence-search --cql "space = DEV AND text ~ \"API\""

# Search by label
confluence-search --cql "label = documentation AND text ~ \"guide\""

# Search by creator
confluence-search --cql "creator = currentUser()"

# Recent content
confluence-search --cql "lastModified >= now(\"-7d\")"
```

**With result limit**:
```bash
confluence-search "API documentation" --limit 20
confluence-search --cql "space = DEV" --limit 50
```

**Piping to jq for parsing**:
```bash
confluence-search "onboarding" | jq '.results[].title'
confluence-search "architecture" | jq '.results[] | {title, url}'
```

**Output format** (JSON):
```json
{
  "results": [
    {
      "id": "123456789",
      "title": "Page Title",
      "type": "page",
      "excerpt": "...highlighted excerpt...",
      "url": "https://domain/wiki/spaces/KEY/pages/123456789/Title"
    }
  ],
  "size": 10,
  "totalSize": 142
}
```

**Key fields**:
- `id` - Numeric page ID (use with `confluence-view`)
- `title` - Page title
- `excerpt` - Search result excerpt with query highlights
- `url` - Full URL to view page in browser
- `totalSize` - Total matching pages (may exceed `size` if limited)

### View: `confluence-view`

Retrieve full content and metadata for a specific Confluence page.

**Basic usage**:
```bash
# By page ID
confluence-view 123456789

# By URL (any Confluence URL format)
confluence-view "https://company.atlassian.net/wiki/viewpage.action?pageId=123456789"
confluence-view "https://company.atlassian.net/wiki/spaces/DEV/pages/123456789/Page+Title"
```

**Metadata-only mode** (excludes content):
```bash
confluence-view 123456789 --metadata
```

**Piping to jq for parsing**:
```bash
# Extract title
confluence-view 123456789 | jq '.title'

# Extract HTML content
confluence-view 123456789 | jq '.content'

# Get page space and version
confluence-view 123456789 | jq '{space: .space.name, version: .version}'
```

**Convert HTML to Markdown**:
```bash
# Requires pandoc
confluence-view 123456789 | jq -r '.content' | pandoc -f html -t markdown

# GitHub-flavored markdown
confluence-view 123456789 | jq -r '.content' | pandoc -f html -t gfm

# Save to file
confluence-view 123456789 | jq -r '.content' | pandoc -f html -t markdown -o page.md
```

**Output format** (JSON - full mode):
```json
{
  "id": "123456789",
  "title": "Architecture Overview",
  "type": "page",
  "status": "current",
  "space": {
    "key": "DEV",
    "name": "Development"
  },
  "content": "<html>...</html>",
  "version": 12,
  "url": "https://domain/wiki/spaces/DEV/pages/123456789/Architecture"
}
```

**Output format** (JSON - metadata mode with `--metadata`):
```json
{
  "id": "123456789",
  "title": "Architecture Overview",
  "type": "page",
  "status": "current",
  "space": {
    "key": "DEV",
    "name": "Development"
  },
  "url": "https://domain/wiki/spaces/DEV/pages/123456789/Architecture"
}
```

### Common Workflows

#### 1. Search then View
```bash
# Find relevant pages
confluence-search "authentication" --limit 5

# Review results, then fetch full content
confluence-view 123456789
```

#### 2. Search with Filtering
```bash
# Get results and filter by space
confluence-search "API" | jq '.results[] | select(.url | contains("/DEV/"))'

# Show only titles and URLs
confluence-search "onboarding" | jq '.results[] | "\(.title): \(.url)"'
```

#### 3. Bulk Content Retrieval
```bash
# Search returns multiple page IDs
IDS=$(confluence-search "architecture" | jq -r '.results[].id')

# Fetch each page (in parallel if using Claude Code)
for id in $IDS; do
  confluence-view "$id" --metadata
done
```

#### 4. Documentation Import
```bash
# Fetch and convert to markdown
confluence-view 123456789 | jq -r '.content' | pandoc -f html -t markdown > docs/imported.md

# Extract specific sections (requires additional HTML parsing)
confluence-view 123456789 | jq -r '.content' | pup 'h2#section-id' text{}
```

### Reference Documentation

For detailed information about specific topics, load these reference files:

- **[`references/cql-patterns.md`](references/cql-patterns.md)** - CQL query patterns, natural language mapping, advanced search techniques
- **[`references/troubleshooting.md`](references/troubleshooting.md)** - Authentication, API errors, common issues, debugging tips

**Loading strategy**:
- For search queries: Load `cql-patterns.md` to understand CQL syntax and query construction
- For authentication/connection issues: Load `troubleshooting.md`
- Load both in parallel when needed

**When to use `--cql` flag**:
- For space-specific searches: `--cql "space = KEY AND text ~ \"term\""`
- For label-based searches: `--cql "label = tag"`
- For date-filtered searches: `--cql "lastModified >= now(\"-7d\")"`
- For complex multi-condition queries: `--cql "space IN (DEV, PROD) AND creator = currentUser()"`
- For simple text searches: Use default mode without `--cql` flag

### Response Formatting

Present Confluence information concisely:

**Search results**:
```
Found 15 pages about "authentication":

1. Authentication Overview (DEV)
   https://company.atlassian.net/wiki/spaces/DEV/pages/123/Auth

2. OAuth Integration Guide (API)
   https://company.atlassian.net/wiki/spaces/API/pages/456/OAuth

Showing 10 of 15 results.
```

**Page content**:
- Display title, space, and metadata first
- Summarize key points from content
- Provide URL for full details in browser
- For long content: Extract relevant sections only

### Requirements

Both scripts require environment variables to be set:

```bash
export CONFLUENCE_DOMAIN="company.atlassian.net"  # or self-hosted domain
export CONFLUENCE_EMAIL="your.email@company.com"
export CONFLUENCE_API_TOKEN="your-api-token-here"
```

**Generating API tokens**:
- Atlassian Cloud: https://id.atlassian.com/manage-profile/security/api-tokens
- Self-hosted: Check with administrator for token generation

**Script availability**:
Scripts are located in `scripts/` directory and should be in PATH after running `setup.sh`.

### Technical Details

**API Path Detection**:
Both scripts automatically detect the correct API path based on domain:
- Atlassian Cloud (`.atlassian.net`): `/wiki/rest/api`
- Self-hosted: `/rest/api`

**Authentication**:
Uses HTTP Basic Authentication with Base64-encoded `email:token`.

**Output Format**:
All responses are JSON for easy parsing with `jq` or other tools.

**Dependencies**:
- `curl` - HTTP client
- `jq` - JSON processor
- `base64` - Base64 encoding

### Error Handling

Common error patterns and their meanings:

- **401 Unauthorized**: Invalid credentials or expired API token
- **403 Forbidden**: Insufficient permissions to access page/space
- **404 Not Found**: Invalid page ID or page doesn't exist
- **429 Too Many Requests**: Rate limit exceeded (wait 60 seconds)

For detailed troubleshooting, see [`references/troubleshooting.md`](references/troubleshooting.md).

### Integration with Other Tools

Confluence content can be combined with other Claude Code capabilities:

**With Jira**:
```bash
# Link Confluence documentation with Jira tickets
# If ticket PROJ-123 mentions page ID 789
confluence-view 789 --metadata
```

**With documentation updates**:
```bash
# Import Confluence content as reference for code documentation
confluence-view 123456789 | jq -r '.content' | pandoc -f html -t markdown > REFERENCE.md
```

**With code generation**:
```bash
# Use Confluence API specs to generate code
confluence-view 123456789 | jq -r '.content' | pandoc -f html -t markdown
# Then use content to inform implementation
```

## Security

Read-only operations enforced by script design:
- Scripts only use GET requests (search and retrieve)
- No write operations (create, update, delete) supported
- API tokens can be scoped to read-only access in Atlassian settings

All operations require explicit environment variable configuration and do not modify any Confluence content.
