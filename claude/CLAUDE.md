# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) across all projects.

## Safe commands

### Safe Find Command

- ALWAYS use the `safe-find` command instead of the `find` command
- The `safe-find` command supports the same options as `find`, but only allows basic filtering
- To see a list of allowed options, run `safe-find -help`:

```
usage: safe-find [-name NAME_PATTERN] [-iname INAME_PATTERN]
                 [-regex REGEX_PATTERN] [-iregex IREGEX_PATTERN]
                 [-path PATH_PATTERN] [-ipath IPATH_PATTERN] [-type {f,d,l}]
                 [-maxdepth MAXDEPTH] [-mindepth MINDEPTH] [-print] [-print0]
                 [-help]
                 paths [paths ...]
```

### Safe Git Commands

- ALWAYS use `safe-git-commit "message"` instead of `git commit`
- ALWAYS use `safe-git-push` instead of `git push`
- ALWAYS use `safe-gh-pr-create "title" "body"` instead of `git pr create`
- These safe Git and GitHub commands do not accept any other flags or arguments

### Confluence Search Command

- Use `confluence-search "query"` to search Confluence for pages
- Returns JSON output with search results
- Requires environment variables: `CONFLUENCE_DOMAIN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`
- Supports `--limit N` flag to control number of results (default: 10)
- Example usage:
  ```bash
  confluence-search "project documentation"
  confluence-search "API guide" --limit 20
  confluence-search "onboarding" | jq '.results[].title'
  ```

### Confluence View Command

- Use `confluence-view <page-id-or-url>` to read a specific Confluence page
- Returns JSON output with page metadata and content
- Requires environment variables: `CONFLUENCE_DOMAIN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`
- Supports `--metadata` flag to return metadata only (no content) for lightweight queries
- Example usage:
  ```bash
  confluence-view 123456789
  confluence-view "https://mycompany.atlassian.net/wiki/viewpage.action?pageId=123456789"
  confluence-view 123456789 --metadata
  confluence-view 123456789 | jq '.title'
  ```
