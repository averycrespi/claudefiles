# Port `reviewing-prs` Skill to Pi

## Goal

Create a Pi-native `reviewing-prs` skill under `pi/agent/skills/reviewing-prs/` that preserves the Claude skill's holistic PR/branch review workflow while adapting it to Pi's tool surface, MCP broker access, and GPT-family behavior.

## Constraints

- Edit only repository source files under `pi/agent/skills/`; do not edit `~/.pi/agent/skills/` directly.
- Keep this as a skill port, not a new extension, unless implementation discovers that skill-only behavior cannot support the workflow.
- Use Pi's `spawn_agents` tool for parallel reviewer delegation instead of Claude Code's `Task` tool.
- Use MCP broker GitHub tools for remote PR access instead of `gh` CLI:
  - `github.gh_diff_pr`
  - `github.gh_view_pr`
  - `github.gh_list_pr_comments`
  - `github.gh_list_pr_reviews`
  - `github.gh_list_pr_review_comments`
  - `github.gh_list_pr_files`
- Prefer local bash/git only for local branch diff mode; use broker-backed tools for remote git/GitHub operations.
- Keep examples generic and public-repo safe; do not add internal project names, URLs, secrets, or proprietary context.
- Match Pi skill conventions from `docs/skills.md`: directory named `reviewing-prs/`, required `SKILL.md`, frontmatter name matching the directory, relative references for bundled prompt files.

## Acceptance Criteria

1. `pi/agent/skills/reviewing-prs/SKILL.md` exists with valid Pi skill frontmatter (`name: reviewing-prs`) and describes when to use the skill.
2. The skill documents both input modes: GitHub PR URL and local branch name.
3. The PR URL path uses MCP broker GitHub tools, not `gh` CLI commands, and includes PR metadata, comments, reviews, review comments, changed files, and diff context when available.
4. The branch path uses local repository inspection to identify the default branch, produce a merge-base diff, and gather changed file context.
5. Reviewer prompts are bundled under `pi/agent/skills/reviewing-prs/` and the skill dispatches six parallel `spawn_agents` review agents: bug hunter, security, codebase alignment, code quality, test quality, and performance.
6. The skill includes GPT-adapted reviewer and synthesis instructions: explicit evidence requirements, strict output shape, no invented line numbers, confidence thresholding, and concise final synthesis.
7. The final report format preserves severity grouping, verdict logic, deduplication, and raw/surfaced finding counts from the Claude skill.

## Chosen Approach

Port as a Pi skill with bundled reviewer prompt files.

### Why this approach

- The original artifact is already a skill; Pi supports the same `SKILL.md` + bundled resources shape.
- Pi's `spawn_agents` extension provides the needed parallel read-only review pattern without building new orchestration code.
- MCP broker GitHub tools replace Claude-specific `gh` CLI assumptions and work better in this harness's authenticated-service model.
- Keeping the reviewer prompts as files preserves progressive disclosure and avoids loading all six role prompts until the skill is actually used.

### Key Adaptations from Claude to Pi

| Claude skill behavior | Pi-native adaptation |
| --- | --- |
| `Task` tool with six Haiku subagents | One `spawn_agents` call containing six `review` agents |
| `gh pr diff/view/api` commands | MCP broker GitHub tools via `mcp_call` |
| `CLAUDE.md` project context | Read relevant AGENTS.md / CLAUDE.md / repo docs if present |
| Assumes local checkout can read changed files | Read local changed files when available; otherwise rely on broker diff and PR metadata |
| Exact-output subagent parsing for Claude | Add GPT-tolerant strict schema reminders and require evidence-backed findings |

## GPT-Specific Prompt Adaptations

Apply these changes while porting the prompts:

- Prefer unambiguous, schema-like output instructions over prose-only constraints.
- Tell reviewers to report only issues with direct evidence in the diff or supplied file context.
- Require `NO_FINDINGS` exactly when no finding meets threshold.
- Require no text before `FINDINGS:` / `NO_FINDINGS` to reduce parsing ambiguity.
- Forbid invented line numbers; if an exact line is unavailable, use the closest changed hunk/file reference and state the uncertainty in the description.
- Keep the 80+ confidence threshold, but tell reviewers to suppress speculative findings rather than lower confidence and include them.
- Use concise descriptions to reduce verbosity bias in GPT outputs.
- In synthesis, treat malformed reviewer output conservatively: parse usable findings, count malformed sections as review gaps, and do not invent missing findings.

## Ordered Tasks

1. Create `pi/agent/skills/reviewing-prs/`.
2. Port `SKILL.md` from `claude/skills/reviewing-prs/SKILL.md`, rewriting tool-specific instructions for Pi:
   - Announce use of the skill.
   - Parse PR URLs and branch names.
   - Use MCP broker calls for PR data.
   - Use local bash/git for branch diffs.
   - Gather AGENTS.md / CLAUDE.md context when present.
   - Dispatch reviewers with `spawn_agents`.
   - Synthesize findings.
3. Copy the six reviewer prompt files into the Pi skill directory.
4. Edit each reviewer prompt for Pi/GPT compatibility:
   - Keep role and scope rules.
   - Add strict evidence and line-number rules.
   - Preserve severity/confidence/output format.
   - Avoid Claude-specific language.
5. Add a short "Pi Notes" or equivalent section to `SKILL.md` covering:
   - `review` subagents inherit the active model.
   - Remote PR review depends on MCP broker availability.
   - Large PR diffs may be truncated by broker limits; use file lists and additional context where possible.
6. Review the created files for public-repo safety and skill validity.
7. Verify the file layout and, if possible, run a lightweight validation command such as listing/reading the skill files. No typecheck is required for markdown-only skill changes.

## Verification Checklist

- [ ] `find pi/agent/skills/reviewing-prs -maxdepth 1 -type f` shows `SKILL.md` plus six prompt files.
- [ ] `SKILL.md` references prompt files by relative path.
- [ ] No `gh pr ...` or `gh api ...` commands remain in the Pi skill.
- [ ] No Claude Code `Task` tool instructions remain in the Pi skill.
- [ ] The skill tells the agent to use `spawn_agents` with six `review` agents in a single call.
- [ ] The skill tells the agent to use MCP broker GitHub tools for PR URL mode.
- [ ] Reviewer prompts retain exact `FINDINGS:` / `NO_FINDINGS` output contracts.
- [ ] No internal/private data appears in new files.

## Assumptions / Open Questions

- Assumption: A skill-only port is sufficient; no custom Pi extension is needed for deterministic parsing/synthesis.
- Assumption: The `subagents` and `mcp-broker` extensions are installed in the target Pi environment, as they are present in this repo.
- Assumption: Local branch review runs from a checkout where the target branch is available.
- Open question: Whether to keep six separate reviewer prompt files or consolidate repeated rules into one shared reference file. Current recommendation: keep six files for a minimal faithful port.

## Known Issues / Follow-ups

- A skill-driven synthesis step is model-executed, not deterministic. If consistency becomes a problem, a future Pi extension could implement parsing, deduplication, and report generation as code.
- `github.gh_diff_pr` output can be truncated for large PRs. The skill should surface truncation as a review gap rather than pretending the review is complete.
- Remote PR full-file context may be unavailable unless the workspace is a checkout of the same repository; the skill should not assume local files match the PR unless verified.
