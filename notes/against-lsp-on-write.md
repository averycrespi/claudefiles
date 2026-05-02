# Against LSP-on-Write

## The intuition, and why it's wrong

Piping LSP diagnostics into the agent's tool results after every `write` or `edit` is the obvious integration: the IDE already knows about the errors, the agent just edited a file, attach the list. Most coding agents ship this on by default — Cursor, aider, Windsurf, OpenCode, GitHub Copilot's coding agent, and Pi's upstream default. I think the default should flip. The failure mode is specific and the fix is cheap.

## The mid-task inconsistency problem

Agents mutate one file at a time. Anything non-trivial — renaming a function, moving an import, splitting a module — takes multiple writes, and during that window every file except the most-recently-edited one is out of sync with the edit that's in flight. The LSP sees that inconsistency and reports it accurately. The errors are **real from the server's point of view and misleading from the task's point of view** — intermediate states the model is about to fix with its next write.

Surface them as tool-result feedback and the model treats them as bugs. It stops the task it was doing, chases them, and derails. I ran into this while experimenting with a Pi extension that auto-injected diagnostics into every `write`/`edit` tool_result. I removed both paths for exactly this reason:

> Diagnostics captured in that window are "real" from the server's point of view but misleading from the task's point of view — they describe an intermediate state the model is about to fix with its next write. Surfacing them pushed the model down rabbit holes fixing errors that would have gone away on their own.

The failure mode is widespread. A Claude Code user in [#17979](https://github.com/anthropics/claude-code/issues/17979) says they preemptively warn the model _"LSP is often stale, treat it as a weak signal."_ [#21297](https://github.com/anthropics/claude-code/issues/21297) catches pyright flagging a freshly-added import as unused because it analyzed pre-persist. [#26634](https://github.com/anthropics/claude-code/issues/26634) has the model burning turns on pyright's `DiagnosticTag.Unnecessary` hints — a category it can't fix without more context than the snippet provides. Zed users [asked for a kill-switch](https://github.com/zed-industries/zed/issues/30142). OpenCode users [hit the same pattern](https://github.com/sst/opencode/issues/12702) during merge conflicts. Cursor has a recurring [forum](https://forum.cursor.com/t/unrestricted-loop-of-linter-errors/36436) [complaint](https://forum.cursor.com/t/turn-off-auto-linter-fix/38741) about the linter-fix loop.

## The fix: pull, not push

Make LSP a tool the agent calls, not a signal it receives. The model decides when the code is at a coherent checkpoint — end of a task, before declaring done, as part of self-review — and polls diagnostics at that moment. Same information, completely different effect on the loop.

A few harnesses have landed here:

- **Claude Code's IDE MCP server** exposes `mcp__ide__getDiagnostics` as a tool; nothing is auto-injected into tool results.
- **Zed's Agent Panel** ships a `diagnostics` tool, documented as _"useful after making edits to determine if further changes are needed."_
- **[Kiro](https://kiro.dev/blog/empowering-kiro-with-ide-diagnostics/)** is the clearest articulation: diagnostics are checked _"after generating code"_ at targeted moments, explicitly to avoid _"spurious build/test commands"_ from intermediate errors.

Two useful things can still happen on every write without pushing the model around: running the formatter (local, single-file, no cross-file state) and warming the LSP with `didChange` so the next poll is cheap. Neither has to touch `tool_result`.

## The steelman

I've convinced myself on multi-file refactors, which is what I mostly do. The counterarguments I take seriously:

- **Single-file syntax errors are safe to push.** An agent that writes an obviously broken file should get told immediately. Fine — but the fix there is severity and scope filtering (push `Error`-level diagnostics for the just-edited file only), and at that point you're approximating pull-only with extra surface area.
- **It's a model-layer problem.** A smart enough model learns to ignore stale diagnostics. Probably true over time. Pull-only is more robust today and costs nothing when the model does catch up.
- **Empirical results could cut the other way.** [Nuanced's eval](https://archive.nuanced.dev/blog/evaluating-lsp) found that LSP context materially helped their agent. I haven't seen a head-to-head measurement of push-after-edit vs. pull-at-checkpoint specifically — the push/pull distinction isn't the axis most evals track. Someone should run it.

## References

- [Kiro — Empowering Kiro with IDE diagnostics](https://kiro.dev/blog/empowering-kiro-with-ide-diagnostics/) — pull-based as an explicit product design choice
- [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — the general "attention is scarce, don't pollute the window" argument
- [Anthropic — Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — tool design principles
- [Nuanced — Evaluating LSP-based code intelligence on coding agents](https://archive.nuanced.dev/blog/evaluating-lsp) — empirical counterweight worth engaging
