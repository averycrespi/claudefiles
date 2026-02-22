# README Improvements Design

## Goal

Improve both the main README and orchestrator README so that visitors quickly understand what cco does and why they'd want it, without needing to click through multiple files.

## Main README Changes

### Expand the cco section (lines 113-117)

Replace the current two-liner with:

1. **Short pitch** — 2-3 sentences explaining what cco does and the problem it solves (running multiple Claude Code sessions in parallel on separate branches without interference)
2. **Quick usage example** — show `cco add`, `cco attach`, and `cco rm` in a compact code block so readers get the feel immediately
3. **Link** — keep the link to orchestrator README for full documentation

## Orchestrator README Changes

### Restructure from command-first to concept-first

**New structure:**

1. **Introduction** — one paragraph: what problem cco solves (parallel Claude Code sessions), how it works at a high level (git worktrees + tmux), and the key benefit (sessions don't interfere with each other or your main working tree)

2. **How It Works** — mental model section covering:
   - Each workspace = worktree + tmux window
   - Dedicated tmux socket (`cco`) to avoid interfering with personal sessions
   - Storage layout diagram

3. **Getting Started** — narrative quick-start showing the basic workflow:
   - `cco add feature-branch`
   - `cco attach feature-branch`
   - `cco rm feature-branch`

4. **Commands** — reference table (existing table, kept as-is)

5. **Workspace Setup** — details on:
   - Init script discovery (`scripts/{init,init.sh,setup,setup.sh}`)
   - Settings copying (`.claude/settings.local.json`)
   - Idempotency guarantee

6. **Sandbox** — isolated VM execution:
   - Brief intro explaining what the sandbox is and why (Lima VM for safe execution)
   - Requirements
   - Lifecycle commands (create, start, stop, destroy, status, provision, shell)
   - Push/pull workflow with examples
   - Notes on persistence and first-boot timing

7. **Development** — build and test commands (kept as-is)

### Key principles

- Lead with *why* before *what*
- Mental model before CLI reference
- Separate narrative "getting started" from exhaustive "command reference"
- Keep sandbox as a clearly distinct capability from core workspace management
