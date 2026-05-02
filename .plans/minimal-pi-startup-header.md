# Minimal Pi Startup Header

## Goal

Replace Pi's default startup header (skills, extensions, keybinds, etc.) with a compact custom header that shows only a small ASCII mark, the Pi version, the current repo/branch, and recent commits.

Target visual:

```text
π› pi v0.65.0 · agent-config · main
   1a2b3c4 refine statusline footer
   9d8e7f6 add workflow mode widget
   4c3b2a1 tighten MCP guard tests
```

Color treatment: render `π›` in the active theme accent color, the version/repo/branch line in normal text with separators dimmed, commit hashes in muted/dim text, and commit subjects in normal text.

## Constraints

- Implement as a directory-based Pi extension under `pi/agent/extensions/`; do not add a top-level single-file extension.
- Do not edit `~/.pi/agent/` directly; this repo is the Stow source.
- Keep the startup UI intentionally minimal; do not list skills, extensions, keybindings, commands, or full paths.
- Header rendering must be synchronous and width-safe; collect git metadata before render and cache it in extension state.
- If git metadata is unavailable, degrade gracefully instead of showing errors.
- Follow existing repo checks: run both `make typecheck` and `make test` before reporting completion.

## Acceptance Criteria

1. Starting Pi with the extension loaded replaces the built-in startup header via `ctx.ui.setHeader()`.
2. The custom header includes a minimal ASCII Pi mark and `pi v<version>` from `@mariozechner/pi-coding-agent`'s exported `VERSION`.
3. In a git repo, the header shows the repo name, current branch, and up to 3 recent commits as short hash plus subject.
4. Outside a git repo or when git commands fail, the header still renders a compact fallback with the cwd basename and no error text.
5. Header lines never exceed the TUI-provided render width; narrow terminals truncate lower-priority text cleanly.
6. Pure rendering and git-output parsing behavior is covered by colocated `*.test.ts` tests.
7. `make typecheck` and `make test` pass.

## Chosen Approach

Create a new extension, likely `pi/agent/extensions/startup-header/`, with a small split between runtime wiring and pure rendering logic:

- `index.ts`
  - On `session_start`, check `ctx.hasUI`.
  - Install a custom header using `ctx.ui.setHeader(...)`.
  - Fetch repo metadata asynchronously once per session start, then request a TUI rerender.
  - On `session_shutdown`, clear request-render references.
- `render.ts`
  - Export pure types and `renderHeader(state, width, theme)`.
  - Contain ASCII art, segment composition, priority/truncation rules, and fallback behavior.
- `git.ts`
  - Export small parsing helpers for git command output.
  - Runtime function gathers repo root/name, branch, and recent commits.
- `*.test.ts`
  - Cover render width behavior, fallback behavior, commit parsing, and max-3 commit display.

Implementation detail: use `pi.exec("git", [...])` from the extension runtime for git calls, not remote/broker git. These are local read-only commands and do not mutate the workspace.

## Assumptions / Open Questions

- Selected direction: **Minimal repo header**.
- Recent commits means the current checkout's `git log -n 3 --pretty=format:%h %s`.
- Dirty state is intentionally omitted to avoid turning the startup screen into a dashboard; the existing statusline can remain responsible for ongoing status.
- No README is needed unless explicitly requested.

## Ordered Tasks

1. Add `pi/agent/extensions/startup-header/` with `index.ts`, `render.ts`, `git.ts`, and colocated tests.
2. Implement pure header rendering:
   - tiny `π›` wordmark in accent color,
   - metadata line with dim separators,
   - up to three commit lines with muted hashes and normal subjects,
   - ANSI-aware truncation using `truncateToWidth` / `visibleWidth` from `@mariozechner/pi-tui`.
3. Implement git metadata gathering with graceful fallbacks:
   - repo root/name,
   - branch name,
   - recent commits.
4. Wire `ctx.ui.setHeader()` on `session_start` and trigger rerender after async metadata arrives.
5. Add tests for rendering, truncation, git parsing, and fallback cases.
6. Run `make typecheck` and `make test`.

## Verification Checklist

- `make typecheck`
- `make test`
- Optional manual check after implementation: launch Pi or use a local extension load path to confirm the startup header visually replaces the default.

## Known Issues / Follow-ups

- If the user later wants dirty-state, ahead/behind, or model/context information, add it behind an explicit design pass; do not include it in this minimal version by default.
- The header appears at startup; it is not intended to be a live dashboard after every git change.
