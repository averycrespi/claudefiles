# Design: Migrate Atlassian Integration to Official MCP Server

## Overview

Replace the current Bash-based Atlassian integration (ACLI for Jira, custom scripts for Confluence) with the official Atlassian Rovo MCP Server. This enables full read/write operations for both Jira and Confluence while simplifying setup.

**Key Decision:** Full migration, not hybrid. MCP becomes the sole Atlassian integration method.

## Motivation

Write operations are needed for both products:
- Create and update Jira issues
- Create and update Confluence pages

Implementing this with ACLI and custom scripts would require substantial work. The official Atlassian MCP provides these capabilities out of the box.

## What Changes

### Removed

- `claude/skills/jira/` directory (SKILL.md + 7 reference files)
- `claude/skills/confluence/` directory (SKILL.md + scripts + 2 reference files)
- ACLI permission entries in `settings.json` (9 entries)
- Confluence script permission entries in `settings.json` (2 entries)
- Skill entries for `Skill(jira)` and `Skill(confluence)`

### Added

- MCP server configuration in `.mcp.json` (project-scoped, version controlled)
- Updated `DESIGN.md` with new rationale
- Updated `CLAUDE.md` with MCP setup instructions
- Updated `README.md` with new setup steps

### Modified

- `setup.sh` - remove ACLI installation guidance, add MCP setup note

## MCP Configuration

The `.mcp.json` file at project root (version controlled, shared with all users):

```json
{
  "mcpServers": {
    "atlassian": {
      "type": "http",
      "url": "https://mcp.atlassian.com/v1/mcp"
    }
  }
}
```

### Setup Flow for Users

1. Run `./setup.sh` (stows dotfiles as before)
2. Start Claude Code in any project
3. Run `/mcp` and select "Authenticate" for Atlassian
4. Complete OAuth flow in browser
5. Done - Jira and Confluence tools now available

No ACLI installation, no API tokens, no environment variables.

## Available Tools After Migration

### Jira

- Search issues (JQL supported)
- Get issue details
- Create issues
- Update issues
- Bulk import from notes

### Confluence

- Search pages (CQL supported)
- Get page content
- Create pages
- Update pages
- Navigate spaces

### Compass (bonus)

- Create service components
- Query dependencies
- Bulk imports

## Tradeoffs

### What's Lost

- Field-level optimization (the MCP decides what to return)
- Server/Data Center support (Cloud-only)
- Offline capability (requires internet for remote MCP)
- Detailed reference documentation (JQL patterns, CQL patterns, error handling guides)

### What's Gained

- Full write operations for both products
- Simpler setup (OAuth vs ACLI + env vars)
- Zero local dependencies
- Official Atlassian support
- Compass integration

## DESIGN.md Update

The "Why Bash Scripts Over MCPs" section becomes "Integration Strategy":

```markdown
## Integration Strategy

This repository uses different approaches based on integration needs:

**MCP for cloud services with write operations (Atlassian):**
- OAuth handles authentication cleanly
- Write operations require official API support
- Remote MCP eliminates local dependencies

**Bash scripts for local tooling (worktrees, git helpers):**
- Agents are excellent at Bash
- Self-contained, no external dependencies
- Full control over behavior

The original Bash-based Atlassian integration was replaced with MCP
when write operations became a requirement. The official Atlassian
MCP server provides create/update capabilities that would require
substantial custom development otherwise.
```

## Implementation Plan

### Files to Create

- `.mcp.json` - MCP server configuration

### Files to Modify

- `DESIGN.md` - Update integration strategy section
- `CLAUDE.md` - Update setup instructions, remove Jira/Confluence skill references
- `README.md` - Update setup steps, remove ACLI/env var instructions
- `setup.sh` - Remove ACLI guidance, add note about `/mcp` authentication
- `claude/settings.json` - Remove 13 permission entries

### Files to Delete

- `claude/skills/jira/` - Entire directory
- `claude/skills/confluence/` - Entire directory

## Notes

- The `jira-write` branch is unrelated to this migration and will remain untouched
- Users on Server/Data Center deployments will need to use alternative tooling
