# Integrations

## Claude Code Orchestrator

`cco` lets you run multiple Claude Code sessions in parallel, each on its own branch. It uses Git worktrees and tmux to keep sessions isolated from each other and from your main working tree.

```sh
cco add feature-branch       # create workspace, launch Claude Code
cco attach feature-branch    # switch to it later
cco rm feature-branch        # clean up when done (keeps the branch)
```

`cco` also supports advanced features for executing plans inside an isolated sandbox VM.

See the [cco README](../cco/README.md) for full documentation.

## Atlassian (Jira + Confluence)

Read and write access to Jira issues, Confluence pages, and Compass via the official Atlassian MCP server.

**Setup:**

1. Start Claude Code in any project
2. Run `/mcp` and select "Authenticate" for Atlassian
3. Complete OAuth flow in browser
4. Done - Jira and Confluence tools now available

**Capabilities:**
- **Jira:** Search, create, and update issues
- **Confluence:** Search, create, and update pages
- **Compass:** Query and create service components

**Requirements:**
- Atlassian Cloud account (Server/Data Center not supported)
- Internet connection for remote MCP server

## Browser Automation

Automate browser interactions for web testing, form filling, screenshots, and data extraction using [playwright-cli](https://github.com/microsoft/playwright-cli).

**Setup:** Installed automatically by `setup.sh` via `npm install -g @playwright/cli@latest`.

**Capabilities:**
- Navigate websites and interact with page elements
- Fill forms, click buttons, take screenshots
- Manage browser sessions, tabs, cookies, and storage
- Network request mocking and DevTools integration

**Usage:** Ask Claude to browse a website or interact with a web page, and it will use the `automating-browsers` skill automatically.

## Datadog

Full observability access via the official Datadog MCP server — logs, metrics, traces, monitors, incidents, dashboards, and more.

**Setup:**

1. Start Claude Code in any project
2. Run `/mcp` and select "Authenticate" for Datadog
3. Complete OAuth flow in browser
4. Done - Datadog tools now available

**Capabilities:**
- Search and analyze logs, spans, and traces
- Query metrics and metric metadata
- Search monitors, incidents, hosts, and services
- Browse dashboards and notebooks

**Requirements:**
- Datadog account with appropriate permissions
- Internet connection for remote MCP server
