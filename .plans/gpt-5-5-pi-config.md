# GPT-5.5 Pi Configuration Update Plan

## Goal

Update Pi agent configuration and extension defaults so the repo no longer pins GPT-5.4 for built-in subagents and uses GPT-5.5-appropriate thinking levels by default.

## Current Findings

- `pi/agent/settings.json` already sets `defaultModel` to `gpt-5.5`, but still sets `defaultThinkingLevel` to `high`.
- Built-in subagent definitions still pin GPT-5.4 models:
  - `pi/agent/agents/explore.md` uses `openai-codex/gpt-5.4-mini` with `thinking: medium`.
  - `pi/agent/agents/research.md` uses `openai-codex/gpt-5.4-mini` with `thinking: medium`.
  - `pi/agent/agents/review.md` uses `openai-codex/gpt-5.4` with `thinking: high`.
  - `pi/agent/agents/deep-research.md` uses `openai-codex/gpt-5.4` with `thinking: high`.
- `pi/agent/extensions/subagents/README.md` documents those GPT-5.4 pins in its built-in agent table and example frontmatter.
- `pi/agent/extensions/workflow-modes/modes.ts` currently maps workflow modes to:
  - Plan: `high`
  - Execute: `low`
  - Verify: `high`
- Tests and API docs encode the current workflow thinking type as only `"high" | "low"` in:
  - `pi/agent/extensions/workflow-modes/modes.test.ts`
  - `pi/agent/extensions/workflow-modes/api.ts`
  - `pi/agent/extensions/workflow-modes/API.md`

## Constraints

- This is a public repo; do not include private context or internal examples.
- Edit source files under `pi/`, not symlinked files under `~/.pi/`.
- Do not run `make stow-pi` unless explicitly asked.
- Before reporting a Pi extension change complete, run both `make typecheck` and `make test`.

## Acceptance Criteria

1. `grep -R "gpt-5\.4" pi/agent/agents pi/agent/extensions/subagents/README.md` returns no matches.
2. `pi/agent/settings.json` uses `defaultThinkingLevel: "medium"` for GPT-5.5's recommended balanced default.
3. Workflow mode defaults are Plan = `medium`, Execute = `low`, Verify = `high`.
4. Workflow mode TypeScript types, README/API docs, and tests agree with the new `medium` mode default.
5. Built-in subagent docs accurately describe the model behavior after removing or updating GPT-5.4 pins.
6. `make typecheck` passes.
7. `make test` passes.

## Chosen Approach

Recommended default: **remove explicit model pins from the four built-in subagent markdown files** so subagents inherit the active parent model. With `pi/agent/settings.json` already defaulting to `gpt-5.5`, this moves built-in subagents to GPT-5.5 without hardcoding the next migration target.

Recommended thinking levels:

- Session default: `medium`.
  - GPT-5.5 defaults to `medium`, and OpenAI recommends it as the balanced starting point. Use `high` only where the workflow is explicitly quality-over-latency.
- Workflow Plan mode: `medium`.
  - Planning benefits from reasoning, but GPT-5.5's baseline is stronger and high can overthink interactive planning.
- Workflow Execute mode: `low`.
  - Execution-oriented coding and tool use should stay efficient; `low` is preferred over `none` because tool use and multi-step decisions still matter.
- Workflow Verify mode: `high`.
  - Verification/review is quality-sensitive and latency is less important; avoid `xhigh` by default unless evals show a measurable benefit.
- Subagent `explore` and `research`: keep `medium`.
  - They are read-only search/research tasks where balanced reasoning is useful.
- Subagent `review` and `deep-research`: keep `high`.
  - They are explicitly evidence-sensitive review/deep investigation tasks. Do not promote to `xhigh` by default without eval evidence.

## Ordered Tasks

1. Update `pi/agent/settings.json`: change `defaultThinkingLevel` from `high` to `medium`.
2. Update `pi/agent/agents/*.md`: remove the explicit `model:` lines from `explore`, `research`, `review`, and `deep-research` so they inherit the parent model.
3. Update `pi/agent/extensions/subagents/README.md`:
   - change the built-in agent table model column to inherited parent model behavior
   - update the example frontmatter away from `openai-codex/gpt-5.4-mini`
4. Update workflow mode thinking defaults:
   - `pi/agent/extensions/workflow-modes/modes.ts`: Plan `high` → `medium`; Execute remains `low`; Verify remains `high`
   - widen related TypeScript types from `"high" | "low"` to include `"medium"`
5. Update workflow mode tests and docs:
   - `modes.test.ts` expected Plan value
   - README Plan description
   - API docs/type snippets if needed
6. Search for stale GPT-5.4 references in live Pi agent config/docs and remove any unintentional pins.
7. Run verification: `make typecheck` and `make test`.

## Assumptions / Open Questions

- Assumption: the goal is to stop pinning GPT-5.4 in live built-in Pi subagents, not to preserve cheaper GPT-5.4-mini agents.
- Assumption: using inherited parent model is preferable to hardcoding `openai-codex/gpt-5.5`, because it keeps future model migrations simpler.
- Open question: if subagent cost/latency is more important than model consistency, `explore` and `research` could intentionally keep `gpt-5.4-mini`; that would leave known GPT-5.4 references by design.

## Verification Checklist

- Run `grep -R "gpt-5\.4" pi/agent/agents pi/agent/extensions/subagents/README.md`.
- Run `grep -R "defaultThinkingLevel" pi/agent/settings.json`.
- Run `make typecheck`.
- Run `make test`.

## Known Issues / Follow-ups

- Current installed Pi supports `openai-codex/gpt-5.5` and `xhigh` for that model, but no `gpt-5.5-mini` was found in the global Pi model catalog. If a GPT-5.5 mini model appears later, revisit whether fast read-only subagents should pin it instead of inheriting the parent model.
- GPT-5.5 migration guidance also recommends prompt rebaselining and moving tool-specific guidance into tool descriptions. This plan only updates model pins and thinking levels; prompt cleanup should be a separate review if desired.
