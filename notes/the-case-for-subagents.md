# The Case for Subagents

## What I mean by subagent

A child invocation spawned by a main orchestrating agent to do scoped work and return a small result. In the workflows I care about, subagents are arranged **linearly** — the orchestrator dispatches one, waits, optionally runs review layers against the output, then either accepts it or redispatches with corrections. Not a parallel swarm of peers.

## The main argument: context quality

The agent gets less intelligent as its context fills up. Long contexts degrade instruction-following, lose track of earlier constraints, and drift. The main agent is the one you actually need to be sharp — it holds the plan, makes the decisions, and decides when to stop.

Shunting work into a subagent and getting back only a summary keeps the main agent's context lean. The subagent can burn through hundreds of thousands of tokens reading files, running tools, and iterating; the orchestrator sees a paragraph.

This is a **quality** argument, not a cost argument. Subagents burn more tokens, not fewer — [~10x more on typical implementation tasks](https://labs.voidwire.info/posts/the-real-cost-of-claude-code-subagents/). You're trading raw token spend for a sharper orchestrator, and that's usually the right trade.

Secondary benefits worth noting: subagents can run with different models (cheap model under expensive orchestrator), different tool allowlists, and without inheriting the orchestrator's conversational assumptions when that's desirable (e.g. independent review).

## The observability complaint

The standard objection: you can't see what the subagent is doing, and you can't steer it mid-flight the way you can steer the main agent. The stronger version is about auditing — "I can't verify what it did after the fact, so I don't trust the output."

## Why I think the complaint points at an architecture problem

If you find yourself wanting to reach into a subagent and steer it, you've scoped it wrong. A well-architected subagent has a narrow, well-specified job and a clear deliverable. If it goes off the rails, the problem is upstream — the orchestrator handed it a bad prompt, an unclear deliverable, or too much latitude.

Trust the output, don't trust the subagent: put review layers between the subagent and the orchestrator. If the output fails review, redispatch with corrections. This is much more robust than trying to babysit a running subagent, and it's the pattern my own workflow leans on heavily.

## The parallel-coordination counterargument

Cognition's [Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents) is the serious dissent, and it's worth naming because it's partly right. Their Flappy Bird example: one subagent builds a Mario-style background, another builds a non-game bird, because decomposition leaks implicit decisions the peers can't see. Their conclusion is that tight scoping can't save you.

I think this is accurate for **parallel peer coordination** — genuinely hard, because implicit decisions don't propagate between siblings. It's not accurate for **linear orchestration with review gates**, where a single orchestrator holds the full plan, dispatches one subagent at a time, and judges each output before the next step. Implementation work in that shape is fine — and it's where subagents help _most_, because implementation is what bloats the main context worst.

## References

- [Anthropic — Subagents in Claude Code](https://claude.com/blog/subagents-in-claude-code)
- [Cognition — Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents)
- [Voidwire Labs — The Real Cost of Claude Code Subagents](https://labs.voidwire.info/posts/the-real-cost-of-claude-code-subagents/)
- [`plan-execute-review.md`](./plan-execute-review.md) — the workflow shape this note assumes
