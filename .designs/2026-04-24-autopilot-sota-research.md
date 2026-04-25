# Autopilot vs. State-of-the-Art Workflow Orchestration (April 2026)

A research report comparing the `autopilot` Pi extension to current best practices for autonomous AI coding workflows, focused on turning a ticket or problem description into a completed PR on GPT-5 family models (5.0, 5.1, 5.2, 5.4, 5.5).

## Contents

1. [Scope and methodology](#1-scope-and-methodology)
2. [Baseline — what autopilot does today](#2-baseline--what-autopilot-does-today)
3. [Where autopilot is already aligned with consensus](#3-where-autopilot-is-already-aligned-with-consensus)
4. [Findings from the Pi extension ecosystem](#4-findings-from-the-pi-extension-ecosystem)
5. [Findings from the broader SOTA literature](#5-findings-from-the-broader-sota-literature)
6. [Top recommendations, ranked by leverage](#6-top-recommendations-ranked-by-leverage)
7. [Anti-patterns to avoid](#7-anti-patterns-to-avoid)
8. [The bigger reframing: design-doc-to-branch vs. ticket-to-PR](#8-the-bigger-reframing-design-doc-to-branch-vs-ticket-to-pr)
9. [Suggested implementation sequence](#9-suggested-implementation-sequence)
10. [Sources](#10-sources)

---

## 1. Scope and methodology

The brief was: survey state-of-the-art practices for autonomous AI coding workflow orchestration on GPT-5 family models (5.4 and 5.5 in particular), with a focus on turning a ticket or problem description into a completed PR. Compare against the existing `autopilot` extension in this repo and recommend concrete improvements.

The research used three parallel investigations:

1. **Deep technical analysis** of five Pi extension repos identified by the user as inspiration (`tmustier/pi-extensions/ralph-wiggum`, `klaudworks/ralph-meets-rex`, `ruizrica/agent-pi`, `davidorex/pi-project-workflows`, `tmdgusya/roach-pi`). Method: read the actual orchestration source, agent system prompts, and YAML/JSON workflow definitions — not just READMEs.
2. **Broader Pi ecosystem search** beyond the five-repo seed (GitHub repo/code search, npm dependents on `@mariozechner/pi-coding-agent`, blog posts, HN/Twitter discussions). ~60 additional repos surfaced, with deep dives on the most influential.
3. **SOTA literature survey** of GPT-5-era prompting guides, SWE-bench scaffold write-ups, lab publications (Anthropic, OpenAI, Cognition), 2026 academic results on long-horizon agent failure modes, and production case studies of Jira/Linear-to-PR pipelines.

Sources cited inline; full bibliography in [§10](#10-sources).

---

## 2. Baseline — what autopilot does today

`autopilot` is a Pi extension that runs an autonomous `plan → implement → verify` pipeline from a design document to a PR-ready branch. The orchestrator is deterministic TypeScript; every LLM call is a fresh subagent dispatched via the `subagents` extension.

Key load-bearing decisions in `pi/agent/extensions/autopilot/`:

- **Input** is a path to a design document (typically `.designs/YYYY-MM-DD-<topic>.md`).
- **Output** is commits on the user's current branch. No push, no PR creation, no branch switching.
- **Three phases**: plan (1–15 outline-level tasks), implement (sequential per task, fresh subagent each), verify (validation + parallel reviewers + capped fix loops).
- **Strict JSON schemas** (TypeBox) for every subagent's output, validated by a shared `parseJsonReport` helper.
- **Sequential implement**, parallel reviewers (plan-completeness, integration, security), 2-round caps on both fix loops.
- **Sticky completion** — once a task reaches `completed` there is no edge out (anti-perfectionism).
- **No verify → implement loopback** — failing checks become "known issues" in the report; the pipeline always terminates.
- **Cancel via `AbortController`** signal propagated to all subagents.
- **One run at a time** guarded by a module-level `activeRun`.

This is the architecture being compared against the field.

---

## 3. Where autopilot is already aligned with consensus

Several of autopilot's design choices match what the field converged on across 2025–2026. Worth recording so they aren't second-guessed:

| Decision                                         | Why it's right (with sources)                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code orchestrator, not LLM                       | Anthropic's [Claude Code retrospective](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built) reports 98.4% of Claude Code is deterministic infra. Cognition's [Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents) formalized this principle.                                             |
| Strict JSON output schemas                       | OpenAI [GPT-5.2 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide) recommends strict JSON schemas for every structured phase. [`davidorex/pi-project-workflows`](https://github.com/davidorex/pi-project-workflows) builds the entire engine around schema-validated step boundaries. |
| Sequential implement                             | Cognition principle 2 — actions carry implicit decisions; parallel implementations fork micro-decisions that conflict at merge. Empirically not adopted at scale.                                                                                                                                                                  |
| Parallel reviewers (read-only)                   | Universal across the field. [`tmdgusya/roach-pi`](https://github.com/tmdgusya/roach-pi) runs 10 reviewers (5 lenses × 2 seeds); [`ruizrica/agent-pi`](https://github.com/ruizrica/agent-pi) has 5 lenses; all SOTA SWE-bench scaffolds use ≥3.                                                                                     |
| Fresh subagent per task                          | Every Pi extension surveyed defaults to fresh context for subagents. roach-pi makes "fork from parent" require an explicit `PI_SUBAGENT_FORK_SESSION` env var — no silent fallback.                                                                                                                                                |
| 2-round fix-loop caps + sticky completion        | Maps to [`pi-supervisor`](https://github.com/tintinweb/pi-supervisor)'s "5-strike lenient mode" pattern. Without it, verifiers perpetually nitpick on style.                                                                                                                                                                       |
| No verify → implement loopback                   | The exact open-ended loop GPT-5-class models thrash in. `klaudworks/ralph-meets-rex` ships the loopback design with explicit warnings and a `HUMAN_INTERVENTION_REQUIRED` escape hatch.                                                                                                                                            |
| Halt instead of skip on first task failure       | rmr's review-agent halts at `human_intervention_required`; roach-pi's `autonomous-dev` halts after 3 clarification rounds. Same pattern.                                                                                                                                                                                           |
| Pre-flight checks (clean tree, base SHA capture) | Standard across all serious orchestrators. Worktree-per-run (which autopilot does _not_ currently use) is the next step up — see [§6.11](#611-optional-worktree-per-run).                                                                                                                                                          |

The verdict: the architectural skeleton is sound. The improvements below are additive, not corrective.

---

## 4. Findings from the Pi extension ecosystem

### 4.1 The five seed repos

Compact summary; full per-repo analysis available on request.

| Repo                                                                                           | Shape                                                                                                          | Subagents                                                                                        | Key technique to steal                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`tmustier/pi-ralph-wiggum`](https://github.com/tmustier/pi-extensions/tree/main/ralph-wiggum) | Single-stage in-session loop with optional reflection checkpoints                                              | None                                                                                             | `before_agent_start` re-injecting loop instructions to survive compaction                                                                        |
| [`klaudworks/ralph-meets-rex`](https://github.com/klaudworks/ralph-meets-rex)                  | YAML-defined sequential steps, code orchestrator, conditional looping                                          | Fresh subprocess per step (claude/codex/opencode), tag-based output (`<rmr:key>value</rmr:key>`) | "Planner can reject upfront" gate; explicit "do not gold-plate" implementer clause                                                               |
| [`ruizrica/agent-pi`](https://github.com/ruizrica/agent-pi)                                    | Sequential `agent-chain` + 5-phase hybrid `pipeline-team`                                                      | Fresh `pi --no-extensions` subprocess per agent; per-agent model assignment                      | `run_chain` exposed as a tool (orchestrator decides when to invoke); `$INPUT_N` placeholder for cross-step data flow                             |
| [`davidorex/pi-project-workflows`](https://github.com/davidorex/pi-project-workflows)          | Typed DAG with 9 step types (`agent`/`command`/`gate`/`forEach`/etc.)                                          | JSON-schema-validated outputs; per-step retry; per-step timeout                                  | Per-criterion verdicts in the verifier; auto-resume from checkpoint by spec-hash; explicit "evidence must reference file:line" anti-pattern list |
| [`tmdgusya/roach-pi`](https://github.com/tmdgusya/roach-pi)                                    | Phase-gated state machine in LLM (`agentic-harness`); code-orchestrated label-driven worker (`autonomous-dev`) | `single                                                                                          | parallel                                                                                                                                         | chain` modes, depth cap (3), cycle detection, worktree isolation per parallel subagent | Validator information barrier (code-built prompt); 2-seed reviewer fan-out; 3-stage review (parallel finders → verifier → synthesizer); custom compaction preserving phase state; untrusted-data framing for issue content |

The single richest source of patterns is `roach-pi`. Its `autonomous-dev` extension is the closest in shape to what an autopilot extended toward true ticket-to-PR would look like — and its maintainer ships it gated behind `PI_AUTONOMOUS_DEV` with a known-issues doc, which is itself a useful precedent.

### 4.2 Broader Pi ecosystem highlights

The five seed repos are a small fraction of the Pi extension community. ~60 additional repos surfaced; the most influential and directly applicable:

- **[`pi-supervisor`](https://github.com/tintinweb/pi-supervisor)** — external in-memory LLM observer that watches the agent without polluting its context. Returns a `continue | steer | done` JSON action with `confidence` and `reasoning`. Three sensitivity levels (low/medium/high) with confidence floors. Stagnation safeguard: 5 consecutive steers without progress flips it into "lenient mode" (declare done at ≥80% achievement). Single most important pattern for any verify-loop fearing infinite nitpick.
- **[`pi-boomerang`](https://github.com/nicobailon/pi-boomerang)** — cleanest implementation of "amnesiac sub-tasks." After a sub-task runs, the entire conversation sub-tree collapses to a one-line summary; file changes persist on disk; the session tree is kept for forensic replay. `--rethrow N` runs the task N times with inter-pass collapse — the practical mechanism behind Ralph-style iterative refinement. Per-stage model/thinking-level switches in the orchestrator, not the worker.
- **[`pi-coordination`](https://github.com/nicobailon/pi-coordination)** — most sophisticated extension surveyed. Task graph (P0–P3 priorities, formal dependency types) with parallel workers, file reservations, and inter-worker contracts. Scout output splits into ~85K-token "context document" plus ~15K-token "synthesized meta-prompt" — relevant context as data, generation guidance as instruction. Continuation-note restart: failed worker resumes using its own notes rather than re-doing completed work.
- **[`overstory`](https://github.com/jayminwest/overstory)** (1.2k stars) — runtime-adapter abstraction over 11 different coding agents. **Tool-call guards backing role contracts** — scouts physically can't call `Write` even if the prompt says they could. SQLite mailbox for inter-agent messages (~1–5ms queries). Tiered watchdog: mechanical daemon → AI-assisted triage → monitor agent.
- **[`oh-my-pi (can1357)`](https://github.com/can1357/oh-my-pi)** — hash-anchored edits with cited 10× edit-success improvement on some models. LSP diagnostics fire automatically after every edit (40+ languages); errors surface into the next turn as structured signal — verification no longer requires a separate "run the tests" loop for syntax/type-class issues.

### 4.3 Cross-cutting Pi patterns

Recurring across multiple repos:

1. **Tagged-output protocol > free text, ≤ JSON.** rmr's `<rmr:status>`, autonomous-dev's `STATUS:/PR_URL:/SUMMARY:` blocks, ralph-wiggum's `<promise>COMPLETE</promise>`. Models reliably emit tags inside markdown without escaping issues. Autopilot's full-JSON approach pays orchestrator complexity for stricter validation; both are defensible.
2. **The implementer prompt always says "don't gold-plate."** rmr-tackle: "Do NOT gold-plate. Implement what the plan asks for, elegantly, then stop." autonomous-dev-worker: "Keep PRs focused. Respect scope. Don't add unrelated features." Universal failure mode.
3. **Plan = intent, not diff.** "A good plan does NOT contain line-by-line diffs. The implementing agent decides the code-level details" appears almost verbatim across rmr, roach-pi, and agent-pi. Autopilot's plan prompt already enforces this.
4. **Verify is parallelizable and benefits from diversity.** Single-pass verify is rarer than multi-pass.
5. **Termination is hard; cap + structured-output > free-text marker.** Ralph's text-match termination is fragile; tag-based or schema-based completion signals are robust. Autopilot's JSON contract is the most robust form.
6. **Worktrees are underused.** Only roach-pi uses them, and only for parallel subagents.
7. **Compaction is hostile to long pipelines.** Only roach-pi survives compaction by re-injecting workflow state; others assume single-shot or human-driven resume.
8. **Anti-collusion via code-generated prompts.** roach-pi's `plan-validator` is invoked with a code-built prompt that reads acceptance criteria from disk — the implementer's prose never reaches the validator. Highest-leverage anti-collusion technique.
9. **None of them produce real PRs.** Only `autonomous-dev` does, behind a beta flag with a stub spawner default. Autopilot is in the same place.

---

## 5. Findings from the broader SOTA literature

### 5.1 The seven major shifts (2025 → 2026)

1. **The "context wars" verdict is in: shared context beats parallel autonomy for coding.** [Cognition's "Don't Build Multi-Agents"](https://cognition.ai/blog/dont-build-multi-agents) became the consensus position in 2025 and is reinforced by Claude Code's own architecture: subagents are used almost exclusively for _read-only_ work (search, Q&A, review), never for parallel writes. Where parallelism happens, it's at the worktree level with a deterministic orchestrator holding the shared context.
2. **Reasoning-effort is now a per-phase knob, not a global setting.** Both the [GPT-5](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide) and [GPT-5.2](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide) prompting guides explicitly recommend `low`/`minimal` for execution-heavy phases and `medium`/`high` only for research/planning.
3. **Tool preambles and structured plan blocks are now mandatory for instruction-following models.** GPT-5.x will rephrase the goal and emit a plan before tool calls when prompted; suppressing this hurts quality. GPT-5.2 introduced a `<planning>` block whose tokens are _discarded during compaction_ — measurable cost win.
4. **Verification has bifurcated into "test execution" vs "agentic rubrics."** The 2026 ["Agentic Rubrics as Contextual Verifiers"](https://arxiv.org/pdf/2601.04171) paper shows _contextual_ rubrics (built from the ticket + repo at runtime) beat both generic LLM-as-judge and pure test execution on issues where tests are sparse. Complements (not replaces) test execution.
5. **"Diff budgets" and tests-as-stop-condition are emerging as the standard antidote to perfectionism loops.** Beyond the 2-round fix-cap pattern, the field is converging on hard diff size caps per iteration, tests/criteria as the canonical "done" signal, repetitive-output detectors, and idle-iteration kill switches.
6. **Long-horizon failures are dominated by _planning errors_ and _catastrophic forgetting_, not context exhaustion.** The April 2026 ["Long-Horizon Task Mirage"](https://arxiv.org/html/2604.11978v1) paper finds 72.5% of agent failures are process-level — subplan errors and history-error accumulation — making **execution-time plan verification and repair** the highest-leverage mitigation.
7. **Acceptance criteria, expressed Gherkin-style, are now the load-bearing artifact for ticket→PR.** Multiple production case studies ([Bitmovin](https://bitmovin.com/blog/ai-developer-workflows-jira-to-pull-request/), [Kinde](https://www.kinde.com/learn/ai-for-software-engineering/workflows/from-jira-ticket-to-production-code-ai-powered-spec-workflows/), [the 70-Jira-tickets writeup](https://dev.to/taras-lysyi/how-i-completed-70-jira-tickets-using-ai-agents-and-slept-through-it-3knb)) start from explicit Given/When/Then criteria parsed from the ticket, then thread them through every phase as the verification rubric.

### 5.2 GPT-5 family prompting specifics

OpenAI's published guides for GPT-5, GPT-5.1, GPT-5.2, and GPT-5.4 are remarkably consistent on agentic primitives, with each release tightening rather than reinventing.

- **Persistence framing** — "Only terminate your turn when you are sure the problem is solved … never stop or hand back when uncertain." The cited fix for over-clarification on ambiguous tickets.
- **Eagerness control via budget** — explicit tool-call budgets for context discovery; GPT-5.4 guidance: "default to implementing with reasonable assumptions" once intent is clear.
- **Contradictory instructions are uniquely damaging.** Tighter instruction-following means conflicting directives ("never X" + "always X") cause the model to burn reasoning tokens reconciling rather than resolving. A real risk for orchestrators that compose system prompts from multiple skill files — worth a contradiction-linter pass.
- **GPT-5.2 changes** — `<planning>` block (compaction-discardable); tighter scope discipline ("Implement EXACTLY and ONLY what the user requests"); strict JSON schemas explicitly recommended for every structured phase. Autopilot's existing JSON contracts are a very good fit for 5.2/5.4.
- **GPT-5.4 specifics** — "Bias to action" replaces 5.0's more cautious default. Explicitly recommends `reasoning_effort: low` or `none` for execution phases. Plans must reach _active closure_ — every plan item marked Done/Blocked/Cancelled before yielding.
- **Self-rubric construction** — for "zero-to-one" tasks, instruct the model to construct an internal 5–7 category rubric _before_ building, then iterate against it. Free win for spec → code work.

### 5.3 SWE-bench leaders and what they actually do

April 2026 leaders on Verified: Claude Opus 4.7 (87.6%), GPT-5.3-Codex (85.0%), Opus 4.5 (80.9%), Gemini 3.1 Pro (80.6%). On the harder [SWE-bench Pro](https://www.morphllm.com/swe-bench-pro) with standardized scaffolding the same models drop to ~46%, exposing how much of "Verified" is scaffold-driven.

Cross-cutting patterns from the leading scaffolds:

- **AutoCodeRover-style three-phase split**: fault localization → context retrieval → patch generation. Localization uses program analysis (call graphs, symbol resolution, import tracing) and is the largest score contributor.
- **[SWE-agent's ACI (agent-computer interface)](https://swe-agent.com/)**: tightly curated tools — a small set of repo navigation/edit primitives — outperform giving the model raw shell.
- **Augment Code**: hybrid BM25 + dense embeddings + a code-graph layer for symbol dependencies. Live retrieval beats prefetched context.
- **[Live-SWE-Agent](https://arxiv.org/pdf/2511.13646)** (2026): agents that _self-evolve their own scaffolds_ during a run. Early-stage but a signal that scaffold-as-data is becoming a research direction.

Implication for autopilot: a dedicated **localization phase** before implementation (separate from planning) is missing and is the single most consistent feature of top scaffolds. Read-only and parallelizable.

### 5.4 Lab-published patterns

[**Anthropic**](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) on context engineering names three load-bearing techniques: **compaction**, **structured note-taking**, **just-in-time context retrieval**. Just-in-time beats all-at-once; agents carry lightweight identifiers and resolve them on demand. Subagents in Claude Code are deliberately constrained to _answering questions, not writing code_.

[**Cognition**](https://cognition.ai/blog/devin-annual-performance-review-2025) reports from 18 months of Devin: "performs worse when you keep telling it more after it starts the task." Iterative coaching mid-task is _negative-EV_ for current-gen agents — the orchestrator should take the spec as immutable once implementation begins. Devin 2.0's [Interactive Planning](https://cognition.ai/blog/devin-2) phase explicitly _researches first, then proposes_, and waits for human refinement before autonomous execution. PR merge rate doubled (34% → 67%) primarily from better codebase understanding (Devin Wiki), not from better generation.

**OpenAI Codex CLI** (April 2026): native sandbox execution, configurable memory management, sandbox-aware orchestration are now first-class. `apply_patch` is a dedicated tool, not shell — the guide explicitly says use it "to match training distributions."

### 5.5 Long-horizon failure modes

The April 2026 ["Long-Horizon Task Mirage"](https://arxiv.org/html/2604.11978v1) paper provides the cleanest taxonomy yet:

- **Process-level (72.5%)**: Environment Error, Instruction Error, **Planning Error (subplanning)**, **History Error Accumulation**. The latter two dominate.
- **Design-level (27.5%)**: Catastrophic Forgetting (constraints erode despite remaining in context), Memory Limitation, False Assumption.

Mitigations with strongest empirical support: hierarchical subplanning with explicit decomposition; **execution-time plan verification and repair**; memory mechanisms preserving long-range constraints. Independent industry data from [Zylos](https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies) and [Harness](https://www.harness.io/blog/defeating-context-rot-mastering-the-flow-of-ai-sessions) reports ~65% of enterprise AI agent failures in 2025 trace to context drift / memory loss, _not_ context exhaustion. Compaction quality matters more than window size.

### 5.6 Verification consensus

April 2026 has converged on three layers:

1. **Deterministic gates first.** Type checks, linters, unit tests, build success. Cheap, infallible-on-true-pass.
2. **Agentic rubrics second.** ["Agentic Rubrics as Contextual Verifiers"](https://arxiv.org/pdf/2601.04171) is the strongest 2026 result: verifier reads the ticket and repo at runtime, builds a problem-specific rubric, scores the patch against it.
3. **Multiple reviewers with rubric calibration third.** Industry consensus: 3–5 reviewers, each with a distinct lens (security, correctness, codebase fit, test quality, performance), each with a _short_ rubric, validated against a golden dataset to 75–90% human agreement before deployment.

Four biases plague every untreated judge: **position, verbosity, self-preference, authority**. Self-preference bias is most dangerous in verify-loops. Rule of thumb: never use the same model for implement and verify if avoidable.

### 5.7 Plan structure & granularity

Clear convergence in 2026: the right unit is "one thought-action cycle" — a step the agent can attempt in a single LLM-call + tool-invocation pair. [MAKER](https://arxiv.org/html/2511.09030v1) showed million-step zero-error chains are possible only with _minimum_ decomposition + heavy error-correction; for normal coding work the sweet spot is 5–15 steps per ticket. TDD-step decomposition outperforms outline decomposition on test-rich codebases; outline decomposition with explicit verification gates wins on test-poor codebases. Autopilot's outline-task plan with 1–15 cap and "no TDD steps" rule sits squarely in this range.

### 5.8 Worktrees, branches, sandboxes

The 2026 standard: one worktree per agent run, shared `.git` object store, isolated working tree and branch. Conflicts move to merge time, not work time. Worktrees isolate code but not runtime — shared ports, databases, services bite hard ([appxlab](https://blog.appxlab.io/2026/03/31/multi-agent-ai-coding-workflow-git-worktrees/), [Penligent](https://www.penligent.ai/hackinglabs/git-worktrees-need-runtime-isolation-for-parallel-ai-agent-development/)). Disk cost is real (reports of ~10GB consumed in 20 minutes on a 2GB codebase via auto-worktree). Branch naming + cleanup matters: `agent/<task-id>/<timestamp>` plus a janitor.

For ticket → PR: worktree created at plan-acceptance time, branch name encodes the ticket ID, orchestrator deletes the worktree (but pushes the branch) on success.

### 5.9 Ticket-to-PR specifics

Production patterns _not_ in autopilot today:

- **Acceptance-criteria extraction as a first-class phase.** Ticket text → Gherkin or structured AC list, threaded into every downstream phase as canonical rubric.
- **Requirement clarification gate.** Before planning, ask: "are the AC unambiguous and testable?" If not, halt with specific clarifying questions, or commit a `CLARIFICATIONS.md` documenting assumptions.
- **Ticket comment as audit trail.** Post plan summary + diff stats + verifier rubric outcome back to the ticket on completion.
- **PR description generation from the plan, not the diff.** The diff lies; the plan tells the story.
- **AC-traceability in the PR body.** Each AC item explicitly mapped to test/code locations.
- **Repo-aware operating procedure file.** GitHub Copilot Agent's `copilot_instructions.md` pattern — checked-in file telling the agent how to behave for _this repo_. The repo's existing `CLAUDE.md` and `AGENTS.md` cover this; explicit ticket-to-PR conventions belong there.

---

## 6. Top recommendations, ranked by leverage

### 6.1 Add an Acceptance-Criteria phase before plan

**Highest leverage for ticket → PR.** Autopilot today consumes a design doc. Production ticket-to-PR pipelines all extract structured AC first and **thread them into every downstream phase** as the canonical rubric — planner, implementer, reviewers all see the same `{id, criterion, verifies_via}` list. Single change addressing the 72.5%-dominant process-error class from the [Long-Horizon Task Mirage](https://arxiv.org/html/2604.11978v1) paper.

Concrete: a `prompts/extract-ac.md` subagent that emits Gherkin or `{id, criterion, verifies_via}` JSON, written to `.autopilot/ac.json`, referenced by file path in every later prompt.

### 6.2 Add a Localization phase before plan

Every top SWE-bench scaffold (AutoCodeRover, SWE-agent, Augment) does this and it's the largest score contributor. Read-only, parallelizable: 2–3 retrieval subagents (one BM25, one symbol-graph walk, one ripgrep concept search) returning a ranked file list and entry points. Feeds into planner instead of letting the planner do its own ad-hoc grepping. Maps cleanly to `roach-pi`'s parallel `explorer` subagents.

### 6.3 Add an execution-time plan-repair gate

Between plan-emit and implement-loop, run a cheap subagent that re-validates the plan against current repo state + AC list. One bounded revision allowed. Highest-leverage _new_ phase from the long-horizon-failures literature — planning errors and history-error accumulation dominate. Maps to rmr's "planner can reject" pattern, applied between phases.

### 6.4 Cross-family verification

Use a different model family for reviewers vs. implementer. Self-preference bias is the most dangerous of the four LLM-judge biases in verify-loops; trivially cheap to mitigate by routing implementer through GPT-5.x and reviewers through Claude (or vice versa). The Pi `subagents` extension supports per-subagent provider/model selection — config change, not architecture change.

### 6.5 Per-phase `reasoning_effort` tuning

[OpenAI's GPT-5.4 guide](https://developers.openai.com/api/docs/guides/prompt-guidance) is explicit: `low`/`minimal` for execution, `medium`/`high` only for research/planning. Most pipelines set this once globally and overspend.

| Phase        | Suggested effort        |
| ------------ | ----------------------- |
| Localization | low                     |
| Plan         | medium                  |
| Plan-repair  | low                     |
| Implement    | low (or minimal on 5.4) |
| Validation   | low                     |
| Reviewers    | medium                  |
| Fixers       | low                     |

### 6.6 Structured note-taking artifacts in the workspace

`PLAN.md`, `DECISIONS.md`, `OPEN_QUESTIONS.md` written to a known path, referenced _by file_ in subagent prompts (not inlined). [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)'s most-cited under-appreciated pattern. roach-pi already does this with the "shared diff artifact." Cuts token costs, survives compaction, gives the human a forensic trail.

### 6.7 Diff-budget and idle-iteration guardrails on implement

Hard cap on per-task diff (e.g., 500 lines added/changed) plus abort-if-no-file-delta-in-N-iterations. Cheap mechanical brakes that catch the "implementer wandered off" failure mode before fix-loops kick in. References: [Tests-First Agent Loop / diff budgets](https://medium.com/@Micheal-Lanham/stop-burning-tokens-the-tests-first-agent-loop-that-cuts-thrash-by-50-d66bd62a948e).

### 6.8 Generate a `PR_BODY.md` artifact at the end

Even if autopilot doesn't push or open the PR, emit a PR description generated **from the plan + AC list, not the diff** (the diff lies; the plan tells the story). Each AC explicitly mapped to test/code locations. The user pastes it. Closes the ticket-to-PR loop without crossing the "no remote actions" line autopilot has correctly drawn.

### 6.9 Two-seed reviewers (cheap diversity, no multi-model complexity)

[`roach-pi`](https://github.com/tmdgusya/roach-pi)'s pattern: each reviewer role runs twice with different seeds, where seed 2 is told "focus on what seed 1 might miss by examining alternative paths." Doubles reviewer cost but cheaper and lower-variance than maintaining 6 distinct reviewer roles.

### 6.10 Validator information barrier

`roach-pi`'s plan-validator is invoked with a **code-built prompt** that reads acceptance criteria directly from disk — the implementer agent's prose never reaches the validator. Anti-collusion. Trivial to add: have the verify subagent's prompt populated by the orchestrator from `.autopilot/ac.json`, not from any prior subagent's output.

### 6.11 (Optional) Worktree per run

Currently autopilot pre-flight requires a clean tree and operates on the user's checkout. The 2026 standard is per-run worktree isolation ([Augment](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution), [appxlab](https://blog.appxlab.io/2026/03/31/multi-agent-ai-coding-workflow-git-worktrees/)). This unlocks: the ability to run multiple autopilot instances in parallel, eliminates the "clean tree required" pre-flight, and gives a clean rollback path if the user wants one. Cost: disk usage and branch janitor logic.

### 6.12 Contradiction-lint composed system prompts

Cheap pre-flight check; large quality win on GPT-5.x given its tight instruction following. The risk is real for an orchestrator that composes prompts from multiple skill files plus per-phase prompts plus user `AGENTS.md` plus repo `CLAUDE.md`.

### 6.13 GPT-5.2/5.4-style `<planning>` blocks with compaction-aware stripping

Implementer subagents emit `<planning>` then `<response>`; orchestrator strips planning from carried context. Per the [GPT-5.2 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide).

---

## 7. Anti-patterns to avoid

- **Multi-agent debate / agent-to-agent negotiation.** [Cognition called this in 2025](https://cognition.ai/blog/dont-build-multi-agents) and it has not aged well. None of the frontier labs ship it.
- **Parallel implementations of the same subtask + merge.** Hidden coupling kills it. Worktree-per-implementer is fine for _different_ tasks but not for racing the same task.
- **LLM-driven mid-task replanning.** [Devin's data](https://cognition.ai/blog/devin-annual-performance-review-2025): "performs worse when you keep telling it more after it starts." Take the spec as immutable once implementation begins. Autopilot already does this — keep it that way.
- **Generic LLM-as-judge without rubrics.** Beaten consistently by rubric-based + cross-family. Reviewers should each carry an explicit rubric tied to AC items.
- **Free-text completion markers.** Ralph's `<promise>COMPLETE</promise>` is fragile; rmr's `<rmr:next_state>done</rmr:next_state>` parsed structurally is robust. Autopilot's JSON schemas already do this — don't regress.
- **Verify → implement loopback.** Autopilot correctly excludes this. Keep it excluded.
- **Massive context windows as a substitute for retrieval.** The "65% of failures are drift, not exhaustion" finding is the death blow. Big windows make compaction _more_ important, not less.
- **Self-improving agents that rewrite their own scaffold mid-run.** Cool research, not production-ready in April 2026.

---

## 8. The bigger reframing: design-doc-to-branch vs. ticket-to-PR

The brief framed this as "ticket → PR" but autopilot today is "design doc → branch." Both ends need work to be a real ticket-to-PR pipeline.

The Pi-ecosystem repo most aligned with the destination is [`roach-pi`'s `autonomous-dev`](https://github.com/tmdgusya/roach-pi) (label-driven GitHub issue worker) — and even its maintainer ships it gated behind `PI_AUTONOMOUS_DEV` with a known-issues doc, which is itself a useful precedent.

The honest extension of autopilot is two new flag-gated commands wrapping the existing pipeline:

- **`/autopilot-from-issue <url>`** — fetches the issue (via `mcp-broker`'s `github_gh_view_issue`), runs an extract-AC + design subagent, writes `.designs/<date>-<slug>.md`, then enters the existing pipeline.
- **`/autopilot-finish`** — generates `PR_BODY.md`, prints the `gh pr create` command (doesn't run it). User stays in the loop for the push.

Together with [§6.1](#61-add-an-acceptance-criteria-phase-before-plan) (AC phase) these turn autopilot into a real ticket-to-PR pipeline without crossing the "no irreversible remote actions" boundary.

---

## 9. Suggested implementation sequence

If you want to adopt these incrementally, this order minimizes blast radius:

1. **Per-phase `reasoning_effort` tuning** ([§6.5](#65-per-phase-reasoning_effort-tuning)). Pure config change, no new code, immediate cost win.
2. **Cross-family verification** ([§6.4](#64-cross-family-verification)). Per-subagent provider/model config. Measurable bias reduction.
3. **Diff-budget and idle-iteration guardrails** ([§6.7](#67-diff-budget-and-idle-iteration-guardrails-on-implement)). Pure orchestrator code, no new prompts.
4. **PR_BODY.md generation** ([§6.8](#68-generate-a-pr_bodymd-artifact-at-the-end)). New post-verify phase, code-built from existing artifacts. Closes the ticket-to-PR gap on the output side.
5. **Acceptance-Criteria phase** ([§6.1](#61-add-an-acceptance-criteria-phase-before-plan)). New pre-plan subagent. Forces the design doc to expose its AC; implementer and reviewers gain a shared rubric.
6. **Validator information barrier** ([§6.10](#610-validator-information-barrier)) — depends on §6.1 because the AC list is what the code-built prompt reads.
7. **Two-seed reviewers** ([§6.9](#69-two-seed-reviewers-cheap-diversity-no-multi-model-complexity)). Reviewer config change, doubles reviewer cost, lower-variance findings.
8. **Localization phase** ([§6.2](#62-add-a-localization-phase-before-plan)). New pre-plan subagent fan-out. Bigger architectural change but well-scoped.
9. **Execution-time plan-repair gate** ([§6.3](#63-add-an-execution-time-plan-repair-gate)). New phase between plan and implement, depends on AC list.
10. **Structured note-taking artifacts** ([§6.6](#66-structured-note-taking-artifacts-in-the-workspace)). Subagent prompt updates + a small orchestrator hook to write the files.
11. **Contradiction-lint** ([§6.12](#612-contradiction-lint-composed-system-prompts)) and **`<planning>` block stripping** ([§6.13](#613-gpt-5254-style-planning-blocks-with-compaction-aware-stripping)). Polish.
12. **Worktree per run** ([§6.11](#611-optional-worktree-per-run)). Largest architectural change; defer until the rest stabilizes.
13. **`/autopilot-from-issue` and `/autopilot-finish`** ([§8](#8-the-bigger-reframing-design-doc-to-branch-vs-ticket-to-pr)). Flag-gated extensions; ship with a known-issues doc, like roach-pi did.

---

## 10. Sources

### Pi extension repos

- [tmustier/pi-extensions/ralph-wiggum](https://github.com/tmustier/pi-extensions/tree/main/ralph-wiggum)
- [klaudworks/ralph-meets-rex](https://github.com/klaudworks/ralph-meets-rex)
- [ruizrica/agent-pi](https://github.com/ruizrica/agent-pi)
- [davidorex/pi-project-workflows](https://github.com/davidorex/pi-project-workflows)
- [tmdgusya/roach-pi](https://github.com/tmdgusya/roach-pi)
- [tintinweb/pi-supervisor](https://github.com/tintinweb/pi-supervisor)
- [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents)
- [nicobailon/pi-boomerang](https://github.com/nicobailon/pi-boomerang)
- [nicobailon/pi-coordination](https://github.com/nicobailon/pi-coordination)
- [nicobailon/pi-review-loop](https://github.com/nicobailon/pi-review-loop)
- [jayminwest/overstory](https://github.com/jayminwest/overstory)
- [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi)
- [gvkhosla/compound-engineering-pi](https://github.com/gvkhosla/compound-engineering-pi)
- [mikeyobrien/rho](https://github.com/mikeyobrien/rho)
- [HazAT/pi-config](https://github.com/HazAT/pi-config)
- [aliou/pi-harness](https://github.com/aliou/pi-harness)
- [qualisero/awesome-pi-agent](https://github.com/qualisero/awesome-pi-agent)
- [bradAGI/awesome-cli-coding-agents](https://github.com/bradAGI/awesome-cli-coding-agents)
- [disler/pi-vs-claude-code](https://github.com/disler/pi-vs-claude-code)
- [pi-coding-agent on npm](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)
- [badlogic/pi-mono](https://github.com/badlogic/pi-mono)
- [pi-mono extensions docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)

### Lab publications and primary write-ups

- [Anthropic — Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic — Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic — Building Effective AI Agents: Architecture Patterns and Implementation Frameworks (PDF)](https://resources.anthropic.com/hubfs/Building%20Effective%20AI%20Agents-%20Architecture%20Patterns%20and%20Implementation%20Frameworks.pdf)
- [Anthropic — 2026 Agentic Coding Trends Report (PDF)](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf)
- [Cognition — Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents)
- [Cognition — Devin 2.0 Architecture](https://cognition.ai/blog/devin-2)
- [Cognition — Devin Annual Performance Review 2025](https://cognition.ai/blog/devin-annual-performance-review-2025)
- [Pragmatic Engineer — How Claude Code Is Built](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
- [Mario Zechner — What I Learned Building an Opinionated and Minimal Coding Agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [Armin Ronacher — Pi: The Minimal Agent](https://lucumr.pocoo.org/2026/1/31/pi/)
- [Armin Ronacher — What is Plan Mode?](https://lucumr.pocoo.org/2025/12/17/what-is-plan-mode/)
- [Geoffrey Huntley — Ralph](https://ghuntley.com/ralph/)
- [Nader Dabit — How to Build a Custom Agent Framework with PI](https://nader.substack.com/p/how-to-build-a-custom-agent-framework)
- [Zvi — Claude Code, Codex, and Agentic Coding 7: Auto Mode](https://thezvi.wordpress.com/2026/04/15/claude-code-codex-and-agentic-coding-7-auto-mode/)

### GPT-5 family prompting guides

- [OpenAI — GPT-5 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide)
- [OpenAI — GPT-5.1 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide)
- [OpenAI — GPT-5.2 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide)
- [OpenAI — GPT-5.4 Prompt Guidance](https://developers.openai.com/api/docs/guides/prompt-guidance)
- [atLabs — GPT-5.2 Prompting Guide: The 2026 Playbook](https://www.atlabs.ai/blog/gpt-5.2-prompting-guide-the-2026-playbook-for-developers-agents)

### Research papers

- [The Long-Horizon Task Mirage (arxiv 2604.11978)](https://arxiv.org/html/2604.11978v1)
- [Agentic Rubrics as Contextual Verifiers (arxiv 2601.04171)](https://arxiv.org/pdf/2601.04171)
- [AgentV-RL: Scaling Reward Modeling with Agentic Verifier (arxiv 2604.16004)](https://arxiv.org/html/2604.16004)
- [S\*: Test-Time Scaling for Code Generation (ACL 2025)](https://aclanthology.org/2025.findings-emnlp.865.pdf)
- [Self-Certainty Best-of-N (arxiv 2502.18581)](https://arxiv.org/pdf/2502.18581)
- [MAKER — Million-Step Zero-Error Decomposition (arxiv 2511.09030)](https://arxiv.org/html/2511.09030v1)
- [Live-SWE-Agent — Self-Evolving Scaffolds (arxiv 2511.13646)](https://arxiv.org/pdf/2511.13646)
- [Survey on Code Generation with LLM Agents (arxiv 2508.00083)](https://arxiv.org/html/2508.00083v1)

### SWE-bench and scaffold write-ups

- [SWE-bench Verified leaderboard](https://www.swebench.com/verified.html)
- [Morph LLM — SWE-bench Pro analysis](https://www.morphllm.com/swe-bench-pro)
- [SWE-agent docs (ACI design)](https://swe-agent.com/)

### Production case studies and engineering blog posts

- [Bitmovin — AI Developer Workflows: Jira to Pull Request](https://bitmovin.com/blog/ai-developer-workflows-jira-to-pull-request/)
- [Kinde — From Jira Ticket to Production Code: AI-Powered Spec Workflows](https://www.kinde.com/learn/ai-for-software-engineering/workflows/from-jira-ticket-to-production-code-ai-powered-spec-workflows/)
- [Taras Lysyi (dev.to) — How I Completed 70 Jira Tickets Using AI Agents](https://dev.to/taras-lysyi/how-i-completed-70-jira-tickets-using-ai-agents-and-slept-through-it-3knb)
- [Augment Code — Git Worktrees for Parallel AI Agent Execution](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution)
- [appxlab — Multi-Agent AI Coding Workflow with Git Worktrees](https://blog.appxlab.io/2026/03/31/multi-agent-ai-coding-workflow-git-worktrees/)
- [Penligent — Git Worktrees Need Runtime Isolation](https://www.penligent.ai/hackinglabs/git-worktrees-need-runtime-isolation-for-parallel-ai-agent-development/)
- [Phil Schmid — Context Engineering Part 2](https://www.philschmid.de/context-engineering-part-2)
- [Zylos — AI Agent Context Compression Strategies](https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies)
- [Harness — Defeating Context Rot: Mastering the Flow of AI Sessions](https://www.harness.io/blog/defeating-context-rot-mastering-the-flow-of-ai-sessions)
- [Adnan Masood (Medium) — Rubric-Based Evals: LLM-as-a-Judge Methodologies](https://medium.com/@adnanmasood/rubric-based-evals-llm-as-a-judge-methodologies-and-empirical-validation-in-domain-context-71936b989e80)
- [Micheal Lanham (Medium) — Tests-First Agent Loop / Diff Budgets](https://medium.com/@Micheal-Lanham/stop-burning-tokens-the-tests-first-agent-loop-that-cuts-thrash-by-50-d66bd62a948e)
