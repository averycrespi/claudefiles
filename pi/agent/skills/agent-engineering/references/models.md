# Model-specific guidance

Two families dominate AI coding agents in April 2026: Anthropic's Claude 4.x and OpenAI's GPT-5.x. They differ on default behavior, the knobs you turn, and the failure modes you guard against. This document captures what's load-bearing for _harness design_ — not a full model card.

Cutoff: 2026-04-27. Verify model names and version-specific claims against the linked primary sources before relying on them.

## Claude 4.x family

Three current models as of 2026-04:

| Model      | Released | Context | Output | Thinking modes              | Notes                                                                                       |
| ---------- | -------- | ------- | ------ | --------------------------- | ------------------------------------------------------------------------------------------- |
| Opus 4.7   | 2026-04  | 1M      | 128K   | Adaptive only               | Long-running, high-reasoning. Default for agent loops where reasoning quality matters most. |
| Sonnet 4.6 | 2025-Q4  | 1M      | 64K    | Adaptive + extended         | The workhorse. Balanced cost/quality.                                                       |
| Haiku 4.5  | 2025-10  | 200K    | 64K    | Extended only (no adaptive) | Fast, cheap. Good for fan-out subagents (review, classify, retrieve).                       |

Authoritative model overview: [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview).

### Opus 4.7 specifics that change harness design

The single most important page: [What's new in Claude Opus 4.7](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7). Breaking changes for harness authors:

- **Extended-thinking budgets removed.** Setting `budget_tokens` returns 400. Adaptive thinking decides on its own.
- **`temperature`, `top_p`, `top_k` removed.** All return 400. Determinism via seeds, not sampling knobs.
- **Thinking content omitted by default.** The model still thinks, but you don't see it unless you opt in via `display: "summarized"`. Agent UIs that streamed thinking tokens for "the agent is working" feedback need to be updated.
- **New tokenizer.** ~1.0–1.35x more tokens than 4.6. Bump `max_tokens` and any compaction triggers proportionally.
- **More literal instruction-following.** Remove old "double-check" / "be careful" scaffolding from prompts — it now produces extra unnecessary verification turns instead of being interpreted as polite emphasis. ([Best practices for using Claude Opus 4.7 with Claude Code](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code))
- **`task_budget` advisory countdown** (beta header `task-budgets-2026-03-13`) gives the model a turn-count budget across the whole agentic loop. Useful for hard-capping runs without destroying the agent's plan.
- **Fewer subagents by default.** 4.7 reasons more before delegating; if your harness depends on parallel subagent fan-out, prompt explicitly for it.
- **Default `xhigh` reasoning effort, not `max`.** `max` overthinks for most agentic work.

### Extended thinking and interleaved thinking

Authoritative: [Building with extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking).

- On 4.6/4.7, **interleaved thinking is automatic with adaptive thinking** — no beta header.
- With interleaved thinking, `budget_tokens` can exceed `max_tokens` (it's per-turn, not per-response).
- Tool-use constraints: `tool_choice` must be `auto` or `none` (not `any`). Thinking blocks **must be passed back unmodified** with tool results — losing them invalidates the chain.
- You **cannot toggle thinking mid-turn**. Pin thinking config across an agent loop.
- Thinking-param changes invalidate the _message_ cache (system stays cached). For long agent loops, use the 1-hour cache and don't change thinking config inside the loop.

### Tool use specifics for Claude 4.x

Authoritative: [Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use).

Three beta primitives that change harness design:

1. **Tool Search Tool** (`defer_loading: true`). Saves ~85% of system-prompt tokens when you have a large tool library, without breaking prompt cache. Tools surface their schemas only when the model searches for them. Especially useful when wiring 30+ MCP tools.
2. **Programmatic Tool Calling** (`allowed_callers: ["code_execution_20260120"]`). Claude writes Python that calls your tools as async functions inside a code-execution sandbox; intermediate tool results never enter the model's context. Best for batch fan-out: verifier loops, multi-file lookups, filter-before-return. Constraints: not compatible with `tool_choice` forcing, `disable_parallel_tool_use: true`, `strict: true`, or MCP-connector tools.
3. **Tool Use Examples**. Lifts complex-parameter accuracy from ~72% to ~90%. Cheap to add.

Reference: [Programmatic tool calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling).

### Claude Agent SDK

The "Claude Code SDK" was renamed to "Claude Agent SDK" in early 2026. It packages the Claude Code agent loop with built-in tools, hooks, subagents, MCP, sessions, and permissions — usable from TS or Python.

- Overview: [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- Building agents: [Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) — frames the loop as gather→act→verify→repeat.
- Migration guide for the rename: [Claude Code SDK → Claude Agent SDK migration](https://docs.claude.com/en/docs/claude-code/sdk/migration-guide). Opus 4.7 requires SDK ≥ v0.2.111.

What the SDK gives you for harness work:

- The same Claude-Code agent loop with built-in tools (`Read`/`Write`/`Edit`/`Bash`/`Monitor`/`Glob`/`Grep`/`WebSearch`/`WebFetch`/`AskUserQuestion`).
- Hooks: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`. Programmatic instead of declarative.
- Subagents via `AgentDefinition`, invoked through the `Agent` tool. Subagent messages tagged with `parent_tool_use_id` so you can track who said what.
- Sessions: capture `session_id` from the init message; resume to keep full context. Critical for multi-step workflows.
- Permissions via `allowed_tools` and `canUseTool` callback ([Permissions handling](https://docs.claude.com/en/docs/agent-sdk/permissions)).
- `setting_sources` to control which `.claude/` configs load — useful when your harness lives inside a user's checkout and you don't want their personal settings to leak.

### Prompt caching for agent loops

Reference: [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) and [Tool use with prompt caching](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching).

- System prompt, tool definitions, and `CLAUDE.md` are cached automatically.
- **5-minute ephemeral TTL is the load-bearing constraint** for any "babysit" or polling loop. Anything over ~270s between turns blows the cache.
- For long-running loops, use the 1-hour cache.
- Place `cache_control: {type:"ephemeral"}` on the _last_ tool definition to cache all of them.
- Thinking-config changes invalidate the message cache; pin thinking config.

### Memory tool

Reference: [Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool). `BetaAbstractMemoryTool` (Python) / `betaMemoryTool` (TS). Client-side `/memories` directory you back with whatever store you want — file system, sqlite, KV. Pairs naturally with structured note-taking artifacts (see `context-engineering.md`).

## GPT-5.x family

Five public models as of 2026-04:

| Model   | Released   | Context | Default `reasoning_effort` | Notes                                                                                    |
| ------- | ---------- | ------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| GPT-5.0 | 2025-Q3    | varies  | medium                     | Original 5.x.                                                                            |
| GPT-5.1 | 2025-Q4    | varies  | medium                     | Tool-use refinements.                                                                    |
| GPT-5.2 | 2026-Q1    | varies  | none                       | Introduced `<planning>` block (compaction-discardable); strict JSON schemas recommended. |
| GPT-5.4 | 2026-Q1    | varies  | none                       | "Bias to action" default; per-plan-item Done/Blocked/Cancelled closure.                  |
| GPT-5.5 | 2026-04-23 | 1.05M   | medium                     | New default Codex model. **Rebaseline prompts — don't drop-in from 5.4.**                |

Prompting guides (each release tightens rather than reinvents):

- [GPT-5 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide)
- [GPT-5.1 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide)
- [GPT-5.2 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide)
- [GPT-5.4 Prompt Guidance](https://developers.openai.com/api/docs/guides/prompt-guidance)
- [Using GPT-5.5](https://developers.openai.com/api/docs/guides/latest-model) — **the highest-signal page in the family**

### GPT-5.5 specifics (most relevant for new harnesses)

Released 2026-04-23. Default `reasoning_effort=medium`. Authoritative pages: [model page](https://developers.openai.com/api/docs/models/gpt-5.5), [system card](https://openai.com/index/gpt-5-5-system-card/), [Using GPT-5.5 guide](https://developers.openai.com/api/docs/guides/latest-model), [introducing GPT-5.5](https://openai.com/index/introducing-gpt-5-5/).

OpenAI's explicit migration directives (from the "Using GPT-5.5" guide):

1. **Don't drop-in replace.** Rebaseline. The-decoder summarizes OpenAI's framing: legacy 5.2/5.4 prompts overspecify and "narrow the model's search space." ([the-decoder migration writeup](https://the-decoder.com/openai-says-old-prompts-are-holding-gpt-5-5-back-and-developers-need-a-fresh-baseline/))
2. **Move tool-specific guidance OUT of the system prompt and INTO tool descriptions.** When to use, side effects, retry safety, error modes — all belong in the tool description. The system prompt should describe the _agent's role_, not how each tool works.
3. **Replace step-by-step procedure prose with outcome + success criteria.** "First do X, then Y, then Z" → "achieve X with these criteria for done." Tighter instruction-following means the model now over-literally follows the procedure even when a better path exists.
4. **Drop output schemas from prose; use Structured Outputs.** Don't say "respond with JSON like {...}" — wire it through the structured output API.
5. **Keep stable content at the start of the request, dynamic at the end.** Caching alignment.
6. **Use the Responses API with correct `phase` handling for all reasoning/tool/multi-turn work.** Compaction and reasoning-token tracking depend on it.
7. **Re-tune `text.verbosity`.** Same `low` setting produces shorter output on 5.5 than on 5.4. ([Simon Willison's notes](https://simonwillison.net/2026/apr/25/gpt-5-5-prompting-guide/))

System-card harness-relevant signal: persistence delta. Cyber Range pass rate jumped 73.33% → 93.33% vs 5.4-Thinking, attributed to "persistence at exploitation." 5.5 keeps going where 5.4 gave up — **explicit stop conditions matter more than they did on 5.4**.

Pricing flips above 272K input tokens (2x in / 1.5x out for the rest of the session). Harness routing should track session token totals.

### GPT-5.4 (still relevant — Codex fallback)

- "Bias to action" replaces 5.0's more cautious default.
- Explicitly recommends `reasoning_effort: low` or `none` for execution phases.
- Plans must reach _active closure_ — every plan item marked Done/Blocked/Cancelled before yielding.
- `<planning>` block (introduced in 5.2) — tokens discarded during compaction. Use it for ephemeral scratch work.

### GPT-5.x recurring patterns

Constant across the family:

- **Persistence framing.** "Only terminate your turn when you are sure the problem is solved … never stop or hand back when uncertain." The fix for over-clarification on ambiguous tickets.
- **Eagerness control via budget.** Explicit tool-call budgets for context discovery. GPT-5.4 guidance: "default to implementing with reasonable assumptions" once intent is clear.
- **Contradictory instructions are uniquely damaging.** Tighter instruction-following means conflicting directives ("never X" + "always X") cause the model to burn reasoning tokens reconciling rather than resolving. Run a contradiction-lint pass over composed system prompts.
- **Self-rubric construction.** For "zero-to-one" tasks, instruct the model to construct an internal 5–7 category rubric _before_ building, then iterate against it.
- **Scope-discipline blocks.** "Implement EXACTLY and ONLY what the user requests." Especially needed on 5.5 because the persistence boost otherwise produces gold-plating.

### Responses API for harnesses

Authoritative pages:

- [Compaction guide](https://developers.openai.com/api/docs/guides/compaction)
- [`/responses/compact` endpoint](https://developers.openai.com/api/reference/resources/responses/methods/compact)

Compaction is first-class. Two modes:

1. **Threshold-driven**: set `context_management.compact_threshold`; on overflow the server emits an opaque encrypted compaction item that carries forward state/reasoning. ZDR-friendly when `store=false`. Chain via appended item OR `previous_response_id`.
2. **Explicit-control**: call `/responses/compact` yourself when your harness decides to compact. Use this when you want compaction to align with phase boundaries (e.g. compact at end of `plan` before entering `implement`).

## OpenAI Codex CLI

Codex CLI is OpenAI's official coding harness — comparable to Claude Code. Tracks GPT-5.x as the default model.

Authoritative pages:

- [Codex changelog](https://developers.openai.com/codex/changelog)
- [Codex CLI features](https://developers.openai.com/codex/cli/features)
- [Codex subagents](https://developers.openai.com/codex/subagents)
- [Codex prompting guide (cookbook)](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide) — the published Codex-1 system message
- [Skills + Shell + Compaction blog](https://developers.openai.com/blog/skills-shell-tips) — best published source on long-running-agent harness discipline
- [AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md)

Recent harness-relevant changes (April 2026):

- **v0.124.0**: Hooks stable for MCP tools, `apply_patch`, and long-running bash. `/side` conversations. `Alt+,` / `Alt+.` for quick reasoning-effort toggling. Model upgrades reset reasoning to new defaults.
- **v0.125.0**: Permission profiles round-trip across TUI/MCP/shell-escalation/app-server. `codex exec --json` reports reasoning-token usage. Rollout tracing records tool/code-mode/session/multi-agent edges. Sandboxed `apply_patch` write fix for split filesystem policies.
- **AGENTS.md resolution**: global `~/.codex/` then root → cwd; `AGENTS.override.md` beats `AGENTS.md` at each level; concatenated root-down so closer files override; capped at `project_doc_max_bytes` (32 KiB). The override convention is the canonical spec for layered agent guidance.
- **Subagents**: concurrency cap `agents.max_threads` (default 6), nesting cap `agents.max_depth`. Pattern from OpenAI: "narrow and opinionated... clear job, tool surface that matches that job." `spawn_agents_on_csv` worker contract requires exactly one `report_agent_job_result` call.
- **Skills**: skill descriptions must answer "when to use / when NOT to use" (same convention as Anthropic Agent Skills). Templates belong inside skills, not system prompt. Two-layer network allowlist (org max + request subset). Use `domain_secrets` so credentials never reach the model.
- **`apply_patch` is a dedicated tool, not shell.** The cookbook prompting guide explicitly says use it "to match training distributions."

## Cross-family rules

These apply regardless of which model family you're using:

1. **Never use the same model for implement and verify if avoidable.** Self-preference bias is the most damaging judge bias. Cross-family routing is the cheapest mitigation. ([Self-Preference Bias paper](https://arxiv.org/abs/2604.06996))
2. **Pin thinking/reasoning config across a single loop.** Mid-loop changes invalidate caches and (on Claude) break thinking-block continuity.
3. **Read the model's own most recent prompting/migration guide before reusing prompts.** Both families have published "your old prompts are wrong" notices for major releases (Anthropic via the 4.7 best-practices post; OpenAI via "Using GPT-5.5"). The advice is genuinely different version-to-version.
4. **Cache strategy is model-specific.** Anthropic: 5-min ephemeral TTL by default; place `cache_control` on the last tool. OpenAI: server-side compaction with opaque items chained via `previous_response_id`.
5. **Tokenizers change.** Recompute context budgets on model upgrades. Opus 4.7's tokenizer is ~1.0–1.35x more tokens than 4.6.
