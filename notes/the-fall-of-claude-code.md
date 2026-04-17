# The Fall of Claude Code

## The thesis

Claude Code is still the dominant coding-agent harness. It is no longer the best one. It is dominant because Anthropic's Pro/Max plans bundle it and because it is the default in the IDE integrations — distribution and lock-in, not fit. The structural problems are a leaky permission model, closed-source opacity, model-vendor lock-in, and accumulating bloat the model does not need. Meanwhile the open, extension-first harnesses have gotten good enough that the switch is cheap.

## The permission model is leaky and fussy at the same time

`--dangerously-skip-permissions` does not actually skip all permissions. Writes to `.claude/` paths remain gated even with the flag set and explicit allow rules ([#37939](https://github.com/anthropics/claude-code/issues/37939), [#37765](https://github.com/anthropics/claude-code/issues/37765), [#42696](https://github.com/anthropics/claude-code/issues/42696)). The complaint has been open across five months and many versions.

Shell composition routes around the allowlist. Until v2.1.7, `git status && rm -rf /important/dir` executed the `rm` without evaluation, because only the first token matched against the allowlist ([#36637](https://github.com/anthropics/claude-code/issues/36637), labeled `area:security`). After the patch, fully-allowlisted compound commands like `git status && echo "---" && pwd` started prompting with nonsensical reasons ([#28183](https://github.com/anthropics/claude-code/issues/28183)). Flatt Security disclosed [eight arbitrary-command-execution paths](https://flatt.tech/research/posts/pwning-claude-code-in-8-different-ways/) through the same machinery (CVE-2025-66032).

This is the worst of both worlds: the system prompts you when you don't want it to, and fails to stop what it should. A pattern-matched allowlist on command strings was [the wrong abstraction to begin with](./moving-permissions-out-of-the-harness.md), but the execution here makes it worse.

## The closed source is a tax

The `anthropics/claude-code` repo is a façade: a README and a plugin directory, with the actual CLI shipped as a 12MB minified `cli.js` inside the npm package ([#19073](https://github.com/anthropics/claude-code/issues/19073)). Multiple serious cleanroom deobfuscations — [ghuntley's](https://ghuntley.com/tradecraft/) is the best-known — exist because people need to know what their tool is doing.

The opacity bites without you asking. The system prompt exceeds 10,000 tokens and changes on every release; Mario Zechner built [`cchistory`](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) specifically to diff it across versions. Runtime config rolls out unilaterally: the February 2026 "redact-thinking" regression was [quantified against 6,852 session logs](https://github.com/anthropics/claude-code/issues/42796) before Anthropic acknowledged it, and the mitigation was an undocumented env var. You cannot pin, fork, or audit your own tool.

## The vendor lock-in will get more expensive

The closed-source complaint is about inspectability. The lock-in complaint is about substitutability: Claude Code only runs against Anthropic models, through Anthropic's auth, billed against an Anthropic Pro/Max subscription or a Claude API key. There is no model-provider setting and no officially supported way to swap the backend. If a competitor ships a better model tomorrow — or Anthropic raises prices — the answer is not "switch providers in Claude Code."

Anthropic is also visibly drifting toward hosted, cloud-mediated features: the web version at claude.ai/code, managed sub-agents, plan-gated capability tiers. Each step is easier to build when the client is locked to your backend and harder to reverse later. Today Claude Code pricing is reasonable for what you get. There is no structural reason it stays that way, and no graceful switch if it doesn't. OpenCode's 75+ providers and Pi's model-agnostic extensions aren't just features — they're the property you actually want when you're betting a workflow on a tool.

## The bloat isn't helping the model

The steelman for a heavy harness is that scaffolding boosts capability. This is becoming empirically wrong. [Terminus 2](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) — an agent that gives the model nothing but a tmux session and raw keystrokes — beats Claude Code on Terminal-Bench. Pi, with four tools and a one-screen system prompt, lands second. When stripping the harness _improves_ scores, the scaffolding isn't buying capability; it is taxing context.

Frontier models have been RL-trained against these workflows for a year. They no longer need the elaborate scaffolding Claude Code was built around. What's left is a _"spaceship with 80% of functionality I have no use for"_ (Zechner) — most of which can't be turned off, and all of which the vendor is free to tweak on your next install.

## The alternative shape

Three open-source harnesses now cover the use cases Claude Code ostensibly owns:

- **[Codex CLI](https://github.com/openai/codex)** (OpenAI) — Apache-2.0, Rust rewrite, OS-level sandboxing (Seatbelt / Landlock). Plan-based billing via ChatGPT.
- **[OpenCode](https://github.com/sst/opencode)** (Dax Raad / SST) — 75+ providers via Models.dev, MCP and plugins first-class. Zechner points out it inherited Claude Code's 10k-token prompt, so it's not a clean break on bloat.
- **[Pi](https://github.com/badlogic/pi-mono)** (Mario Zechner) — four tools, everything else is a user-authored extension. Deliberately refuses built-in sub-agents, plan mode, to-dos, and permission popups. "YOLO by default" on the principle that permissions belong at the sandbox, not the prompt. My current daily driver.

The common thread isn't language or UI. It's that all three ship _primitives_ you can inspect and change, where Claude Code ships a _product_ with decisions already made. That's the axis that's actually shifted.

## References

- Mario Zechner — [What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) — Pi's design manifesto; names Claude Code directly
- Mario Zechner — ["I Hated Every Coding Agent, So I Built My Own"](https://youtu.be/Dli5slNaJu0) — talk version of the above
- Armin Ronacher — [Pi](https://lucumr.pocoo.org/2026/1/31/pi/)
- Flatt Security — [Pwning Claude Code in 8 Different Ways](https://flatt.tech/research/posts/pwning-claude-code-in-8-different-ways/) (CVE-2025-66032)
- ghuntley — [Yes, Claude Code can decompile itself](https://ghuntley.com/tradecraft/)
- Thomas Wiegold — [I Switched From Claude Code to OpenCode](https://thomas-wiegold.com/blog/i-switched-from-claude-code-to-opencode/)
- Daniel Koller — [Why Pi is my new coding agent of choice](https://www.danielkoller.me/en/blog/why-pi-is-my-new-coding-agent-of-choice)
- [`moving-permissions-out-of-the-harness.md`](./moving-permissions-out-of-the-harness.md) — the permission-architecture argument this builds on
