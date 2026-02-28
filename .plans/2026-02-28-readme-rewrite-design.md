# Orchestrator README Rewrite Design

## Goal

Rewrite the orchestrator README to follow CLI documentation best practices: concise landing page with detailed docs split into separate files.

## Research

Analyzed READMEs from fzf, ripgrep, lazygit, gum, and Lima. Key patterns:

- **Progressive disclosure** — quick start first, advanced topics later
- **Landing page + docs split** — README is the entry point, detailed reference lives in `/docs/`
- **Show, don't tell** — visual diagrams or demos communicate value instantly
- **Lead with a workflow** — show natural usage, not isolated commands
- **~800-1500 lines is the sweet spot** — current README tries to be both landing page and full reference

## Current Problems

- Organized by component (sandbox, config, Go proxy) rather than user journey
- "How It Works" (architecture) appears before "Getting Started" (usage)
- Sandbox lifecycle (~55 lines) and Go module proxy details clutter the README for new users
- No value proposition section explaining why cco exists

## New Structure

### README.md (~120-130 lines)

```
1. Title + one-liner description
2. ASCII diagram showing worktrees + tmux windows concept
3. Why cco? (4 bullets: parallel sessions, isolated worktrees, dedicated tmux socket, sandbox mode)
4. Quick Start
   - Install (go install)
   - Shell completion (optional, bash/zsh/fish)
   - Core workflow: add, attach, rm
   - One-sentence explanation of storage layout + tmux socket
5. Commands table (with link to sandbox doc from cco box row)
6. Sandbox teaser (3 commands: create, push, pull + link to docs/sandbox.md)
7. Configuration teaser (2 commands: show, edit + link to docs/configuration.md)
8. Development (build + unit tests + integration tests, inline)
9. License
```

### docs/sandbox.md

Full sandbox documentation, moved from README:

- Setup: create, authenticate Claude Code
- Lifecycle: start, stop, destroy, status, provision
- Push/Pull: workflow, git bundle mechanics, job IDs

### docs/configuration.md

Full configuration documentation, moved from README:

- Config management commands: path, show, init, edit
- Go Module Proxy: setting, how it works, pattern format

## What Changes

| Content | Before | After |
|---|---|---|
| Value proposition | Missing | New "Why cco?" section |
| ASCII diagram | Missing | New, shows worktrees + tmux |
| Quick start | Buried after "How It Works" | Moved to top, streamlined |
| Commands table | Middle of file | After quick start |
| Sandbox details | 55 lines in README | Teaser (6 lines) + docs/sandbox.md |
| Configuration + Go proxy | 30 lines in README | Teaser (5 lines) + docs/configuration.md |
| Development | In README | Stays in README (short enough) |
| "How It Works" section | Standalone section | Folded into one sentence in Quick Start |

## Files to Create/Modify

- `orchestrator/README.md` — rewrite
- `orchestrator/docs/sandbox.md` — new, content from current README
- `orchestrator/docs/configuration.md` — new, content from current README
