# Atlassian MCP Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Replace Bash-based Atlassian integration with official Atlassian Rovo MCP Server for full read/write operations.

**Architecture:** Remove ACLI and custom script integrations. Add project-scoped MCP configuration. Update documentation to reflect new OAuth-based setup flow.

**Tech Stack:** Atlassian Rovo MCP Server (remote HTTP), OAuth 2.1 authentication

---

### Task 1: Add MCP Server Configuration

**Files:**
- Create: `.mcp.json`

**Step 1: Create MCP configuration file**

Create `.mcp.json` at repository root:

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

**Step 2: Verify JSON is valid**

Run: `jq . .mcp.json`
Expected: Pretty-printed JSON output without errors

**Step 3: Commit**

```bash
git add .mcp.json
git commit -m "feat: add Atlassian MCP server configuration"
```

---

### Task 2: Remove Jira and Confluence Skills

**Files:**
- Delete: `claude/skills/jira/` (entire directory)
- Delete: `claude/skills/confluence/` (entire directory)

**Step 1: Remove Jira skill directory**

Run: `rm -rf claude/skills/jira`

**Step 2: Remove Confluence skill directory**

Run: `rm -rf claude/skills/confluence`

**Step 3: Verify removal**

Run: `ls claude/skills/`
Expected: Should NOT contain `jira` or `confluence` directories

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Bash-based Jira and Confluence skills

Replaced by Atlassian MCP server integration."
```

---

### Task 3: Update Settings Permissions

**Files:**
- Modify: `claude/settings.json:40-60`

**Step 1: Remove Atlassian-related permissions**

Remove these 13 entries from the `permissions.allow` array:

```
"Bash(acli jira workitem view:*)",
"Bash(acli jira workitem search:*)",
"Bash(acli jira workitem comment list:*)",
"Bash(acli jira board search:*)",
"Bash(acli jira board list-sprints:*)",
"Bash(acli jira sprint list-workitems:*)",
"Bash(acli jira project list:*)",
"Bash(acli jira project view:*)",
"Bash(acli jira auth status:*)",
"Bash(~/.claude/skills/confluence/scripts/confluence-search:*)",
"Bash(~/.claude/skills/confluence/scripts/confluence-view:*)",
"Skill(jira)",
"Skill(confluence)",
```

**Step 2: Verify JSON is valid**

Run: `jq . claude/settings.json`
Expected: Pretty-printed JSON output without errors

**Step 3: Commit**

```bash
git add claude/settings.json
git commit -m "chore: remove Atlassian permissions from settings

MCP server handles its own authorization via OAuth."
```

---

### Task 4: Update DESIGN.md

**Files:**
- Modify: `DESIGN.md:28-36`

**Step 1: Replace "Why Bash Scripts Over MCPs" section**

Replace lines 28-36 (the entire "Why Bash Scripts Over MCPs" section) with:

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

The original Bash-based Atlassian integration was replaced with MCP when write operations became a requirement. The official Atlassian MCP server provides create/update capabilities that would require substantial custom development otherwise.
```

**Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs: update integration strategy rationale

Explain why MCP is used for Atlassian while Bash remains
for local tooling."
```

---

### Task 5: Update README.md

**Files:**
- Modify: `README.md:115-143`

**Step 1: Replace Integrations section**

Replace lines 115-143 (the entire Integrations section starting with `## Integrations`) with:

```markdown
## Integrations

### Atlassian (Jira + Confluence)

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
```

**Step 2: Update workflow examples**

Replace lines 66-75 (the "Use the integrations to load any relevant context" examples) with:

```markdown
Claude will automatically use the Atlassian MCP tools when you mention Jira tickets or Confluence pages:

```
> You: What's the status of ABC-123?
> Claude: [Uses Atlassian MCP to fetch issue details]
```

```
> You: Create a Jira ticket for the login bug we just discussed.
> Claude: [Uses Atlassian MCP to create issue]
```
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for Atlassian MCP integration

- Simplify setup instructions (OAuth flow only)
- Update workflow examples
- Document capabilities and requirements"
```

---

### Task 6: Update Project CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:37-48`

**Step 1: Update Skills table**

In the "Integration Skills" table, replace the Jira and Confluence entries:

Old:
```markdown
| Skill        | Purpose                                              |
| ------------ | ---------------------------------------------------- |
| `jira`       | Read-only access to Jira issues, boards, and sprints |
| `confluence` | Search and read Confluence documentation             |
```

New:
```markdown
| Integration | Purpose                                              |
| ----------- | ---------------------------------------------------- |
| Atlassian MCP | Read/write access to Jira, Confluence, and Compass |
```

**Step 2: Update setup instructions if present**

If there are Jira/Confluence setup references, replace with:

```markdown
### Atlassian Setup

Run `/mcp` in Claude Code and authenticate with your Atlassian account.
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Atlassian MCP"
```

---

### Task 7: Update setup.sh

**Files:**
- Modify: `setup.sh`

**Step 1: Add post-setup note about MCP authentication**

After the "Done!" echo (before `exit 0`), add:

```bash
echo ''
echo 'Optional: Atlassian integration'
echo '  Run /mcp in Claude Code and authenticate with your Atlassian account.'
```

**Step 2: Commit**

```bash
git add setup.sh
git commit -m "docs: add Atlassian MCP setup hint to setup.sh"
```

---

### Task 8: Final Verification

**Files:**
- None (verification only)

**Step 1: Verify MCP config exists**

Run: `cat .mcp.json`
Expected: JSON with atlassian server configuration

**Step 2: Verify skills removed**

Run: `ls claude/skills/`
Expected: Should NOT contain `jira` or `confluence`

**Step 3: Verify settings.json is valid**

Run: `jq '.permissions.allow | length' claude/settings.json`
Expected: Number less than original (was ~60, now ~47)

**Step 4: Verify no ACLI references in allowed permissions**

Run: `grep -c "acli" claude/settings.json`
Expected: 0

**Step 5: Verify all files committed**

Run: `git status`
Expected: Clean working tree

**Step 6: Review commit history**

Run: `git log --oneline -10`
Expected: See 7 new commits for this migration
