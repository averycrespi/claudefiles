# Ingesting External Data

How to pull data from external sources into the vault. This workflow is
source-agnostic — the same rules apply regardless of where the data comes from.

## Workflow

1. **Search before creating** — use QMD to check if knowledge about this
   topic/ticket/page already exists:
   ```bash
   qmd search "identifier or topic" -c steven --files
   ```

2. **Update over duplicate** — if a match exists, read the existing file and
   update it with new information rather than creating a new one.

3. **Write to knowledge/** — create files in `~/steven-vault/knowledge/`.

4. **Summarize, don't dump** — write concise markdown summaries, not raw API
   responses or full page contents. Focus on status, decisions, and action items.

5. **Tag consistently** — apply the frontmatter tagging convention from SKILL.md.

6. **Preserve provenance** — include source identifiers in frontmatter so future
   runs can find and update the file:
   - Jira: ticket key in `tags` and filename (e.g., `jira-ABC-123-auth-redesign.md`)
   - Confluence: page ID in `tags`

7. **Re-embed once** — after all writes are complete:
   ```bash
   qmd embed
   ```

8. **Update the dashboard** — if ingested data affects active projects, in-flight
   work, or to-dos, update `system/dashboard.md`.

## Data Sources

### Jira (via Atlassian MCP)

- Fetch active tickets using `searchJiraIssuesUsingJql`
- For each ticket: summary, status, assignee, priority, recent comments
- Frontmatter: `source: jira`, `type: ticket`, ticket key in `tags`
- Filename pattern: `jira-<KEY>-<short-description>.md`

### Confluence (via Atlassian MCP)

- Fetch recently updated pages using `searchConfluenceUsingCql`
- Summarize page content to key points and decisions
- Frontmatter: `source: confluence`, `type: page`, page ID in `tags`
- Filename pattern: `confluence-<short-title>.md`

### Other Sources

For sources not listed above, follow the same pattern:

- Set `source` in frontmatter to a short lowercase name (e.g., `slack`, `github`)
- Use that name as the filename prefix (e.g., `slack-<short-description>.md`)
- Include a unique identifier in `tags` so future runs can find and update the file
