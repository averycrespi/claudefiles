# Documentation Restructure Design

## Context

The repository documentation has grown organically and needs restructuring. The main README jams together workflow guides, integration setup, cco summary, and Steven overview. DESIGN.md and FUTURE.md are orphaned at root with no links. The project CLAUDE.md duplicates README content (skill tables, repo structure). There's no root `docs/` directory to organize supporting documentation.

## Goal

Create a cleaner doc structure with a slim README landing page, a `docs/` directory for all supporting documentation, and a deduplicated CLAUDE.md.

## Design

### New File Structure

```
README.md                     # Slim landing page (~60 lines)
docs/
├── workflow.md               # Structured dev workflow (mermaid, usage, when-to-use)
├── integrations.md           # All integration setup guides
├── skills.md                 # Skill/agent catalog tables (single source of truth)
├── claude-code-config.md     # What gets symlinked, how settings/hooks/agents work
├── design-decisions.md       # Renamed from DESIGN.md
└── future.md                 # Renamed from FUTURE.md
```

### README.md (~60 lines)

Landing page for new users evaluating the repo:
- One-paragraph description
- Features list with links to docs
- Quick Start (clone + setup.sh)
- Documentation table linking to all docs/
- Attribution + License

### docs/workflow.md

Extracted from README. Contains:
- Mermaid flowchart
- Usage examples (how to invoke architecting/brainstorming)
- When to use structured workflow vs built-in planning mode

### docs/integrations.md

Extracted from README. All 4 integrations in one file:
- Atlassian (Jira + Confluence) — setup, capabilities, requirements
- Browser Automation — setup, capabilities, usage
- Datadog Logs — setup (keychain commands), capabilities
- Steven — summary with link to steven/README.md

### docs/skills.md

Single source of truth for skill/agent catalog. Extracted from README + CLAUDE.md (deduplicated):
- Workflow skills table
- Integration skills table
- Reference skills table
- Meta skills table
- Agents table

### docs/claude-code-config.md (new)

Explains the claude/ directory and stow mechanism (~40-50 lines):
- What setup.sh does (stow symlinks claude/ → ~/.claude/)
- The "edit in claude/, never ~/.claude/" rule and why
- What each subdirectory contains (agents, commands, hooks, scripts, skills, settings.json, CLAUDE.md)

### docs/design-decisions.md

Renamed + moved from DESIGN.md. Content unchanged.

### docs/future.md

Renamed + moved from FUTURE.md. Content unchanged.

### CLAUDE.md Changes

Remove duplicated content:
- Skill/agent tables (reference docs/skills.md)
- Workflow description (reference docs/workflow.md)
- Repository structure ASCII tree (reference docs/claude-code-config.md)

Keep:
- Public repository guidelines
- Setup command
- Workflow entry point one-liner
- Testing instructions
- "Edit in claude/ not ~/.claude/" warning
- Links to docs/ for deeper context

### Unchanged

- claude/CLAUDE.md (global) — no changes
- cco/ docs — already well-structured
- steven/ docs — already well-structured
- All skill SKILL.md files — untouched
