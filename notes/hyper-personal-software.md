# Hyper Personal Software

## The thesis

Hyper personal software is already here. Coding agents have lowered the maintenance cost of personal tools and personal forks enough that the old default — adapt yourself to the software — is no longer obviously correct. For developer tools especially, the new default can be: make the software fit you.

This is not just "vibe code a toy app." The interesting shift is ownership. A one-off script was always easy. The hard part was living with the thing six months later: fixing bugs, porting it across API changes, adding the missing feature, keeping your fork close enough to upstream that it didn't rot. Agents make that work cheap enough that software for an audience of one becomes a normal choice instead of a heroic indulgence.

## The lineage

This is not a new desire. Clay Shirky called the older version [situated software](http://shirky.com/essays/situated-software/): software written for a particular group, place, or moment rather than a generic market. Robin Sloan and Maggie Appleton later made the domestic version memorable as [home-cooked software](https://www.robinsloan.com/notes/home-cooked-app/) — apps built like meals for yourself, your family, or a small community.

The research-world name is end-user programming, or more recently [malleable software](https://www.geoffreylitt.com/2023/03/25/llm-end-user-programming.html): tools that users can reshape instead of merely operate. Ink & Switch's local-first work adds the infrastructure premise: if the data is local, durable, and user-owned, the software around it can be swapped, forked, and repaired.

Coding agents are the missing cost curve. They do not invent the dream; they make it mundane. The user still supplies taste, constraints, and judgment. The agent absorbs enough of the boring implementation and upkeep that personal software stops being a manifesto and starts being a weekend plan.

## The maintenance wall fell

Personal software used to run into a wall. You could build the first version over a weekend, but then you owned every bug, every edge case, every dependency bump, every half-finished refactor. For most people — even programmers — the rational choice was to accept the off-the-shelf tool and configure around the mismatch.

That calculation changed. Geir Isene's [Audience of One](https://isene.org/2026/05/Audience-of-One.html) is the extreme version: a desktop where almost every daily tool has been replaced by something he built for himself with Claude Code in the loop. The important line is not that he wrote a custom editor. It is that when he wants an enhancement, it is _"just minutes away"_ instead of waiting months, years, or forever for upstream to care.

Carl Lange's [Extremely Personal Computing](https://redfloatplane.lol/blog/14-releasing-software-now/) makes the same point from the other side: some software now has no reason to be published. A Formula E news filter that rewrites spoiler headlines solves a problem so specific that sharing it barely makes sense. It is closer to cooking dinner from what happens to be in your fridge than releasing a product.

That is the new category: not product, not startup, not portfolio project — a tool shaped to the exact contour of one life.

## Developer tools go first

The first wave is developer tools because developers already live close to the medium. We know where the friction is, we can read the code, and we can tell an agent what needs to change with enough precision that it often works. Editors, shells, coding-agent harnesses, browser automation helpers, local dashboards, migration scripts, review bots — these are perfect hyper-personal targets.

My own setup is already in this shape. [`agent-config`](https://github.com/averycrespi/agent-config) is not a product; it is a living pile of Claude and Pi configuration, skills, extensions, prompts, and notes that make my agents behave the way I want. [`agent-tools`](https://github.com/averycrespi/agent-tools) exists for the same reason at the tool boundary: broker credentials, external access, and permissions into a shape that matches my workflow. The point is not that anyone else should use them unchanged. The point is that I can keep changing them.

This will probably move outward. Non-programmers will get more of the same power as agents become better at translating intent into working local tools. But developer tools are where the pattern is clearest today because the feedback loop is shortest and the users are already willing to patch their own environment.

## Open source becomes more valuable

Hyper personal software is a strong argument for open source. If the highest-leverage feature is "I can make this fit me," then source availability is not a licensing detail. It is a product capability.

Source code becomes more actionable in the agent era. Open source used to mean that a motivated human could inspect, patch, and rebuild the thing. Now it also means you can hand the code to an agent and ask for the version that matches your workflow. The code becomes material: something to cut, sand, glue, strip down, or extend.

Closed source software can still be polished, reliable, and convenient. But it cannot participate in this loop. You can ask for a feature, configure what the vendor exposed, or work around the limitation. You cannot say: make this match how I think.

That makes closed systems feel worse than they used to. The complaint in [`the-fall-of-claude-code.md`](./the-fall-of-claude-code.md) was partly about opacity and vendor lock-in: a minified harness, unilateral prompt changes, no model-provider swap, no real fork path. Hyper personal software sharpens that critique. The issue is not only that closed software cannot be audited. It is that it cannot be domesticated.

Open source also changes the meaning of forking. Forking used to be a serious commitment, closer to adopting a pet than changing a setting. Agent-assisted maintenance pushes it toward configuration: keep a branch, carry a patch, merge upstream when needed, let the agent do the tedious conflict work. That does not mean every fork is wise. It means the option has become newly practical.

## The joy of not scaling

A lot of software complexity is empathy for absent users. Configuration systems, plugin APIs, onboarding flows, documentation, backwards compatibility, telemetry, support queues — all useful when you are building for a market. Mostly waste when you are building for yourself.

Paul Butler's [Hyper Personal Software](https://paulwrites.software/articles/hyps/) names the relief directly: no compromises, no audience, no pressure to turn the thing into professional software. Build the exact thing. Use simple technologies. Keep the data in boring formats. Stop when it stops being fun.

That is not laziness. It is right-sizing. A tool that serves one person perfectly is not a failed product. It is a successful personal artifact.

## Caveats

The optimistic version can get stupid quickly.

Personal forks still carry real costs. Agents reduce maintenance burden; they do not erase it. A fork can drift from upstream, accumulate invisible bugs, or become illegible to your future self. "My agent resolved the merge conflict" is not the same as "the fork still preserves upstream's invariants." The easier it is to generate software, the easier it is to generate a junk drawer of half-owned tools.

Security also gets weirder. A tiny local app may not need product-grade process, but it still should not leak credentials, corrupt important files, or run untrusted input through a shell. "Only I use it" is not a defense when the tool touches real accounts or real data.

Supply chain risk compounds in the small. Ten personal tools with ten npm packages each is still a dependency graph. The safer pattern is boring and local: standard libraries where possible, pinned dependencies when not, plain files or SQLite for data, and tools small enough that you can throw them away without losing the thing you care about.

And not everything should be personal. Shared infrastructure, collaboration tools, accessibility-critical interfaces, and systems with broad social consequences need the boring professional machinery. Hyper personal software is a complement to product software, not a replacement for it.

## The direction

The direction is still clear: more software will be personal, more open-source software will be forked instead of merely configured, and more developer workflows will become hand-shaped environments instead of purchased products.

The interesting question stops being "would enough users want this?" and becomes "would I want this enough to keep it alive?" Coding agents changed that answer. They made keeping it alive cheap enough that, for a growing class of tools, the audience of one is sufficient.

## References

- Geir Isene — [Audience of One](https://isene.org/2026/05/Audience-of-One.html) — personal desktop replacement as an already-working example
- Carl Lange — [What does it mean to release software now?](https://redfloatplane.lol/blog/14-releasing-software-now/) — extremely personal computing and software as the equivalent of a meal cooked for yourself
- Paul Butler — [Hyper Personal Software](https://paulwrites.software/articles/hyps/) — the HYPS framing and manifesto
- Clay Shirky — [Situated Software](http://shirky.com/essays/situated-software/) — the older argument for software fitted to a small context instead of a broad market
- Robin Sloan — [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/) — the software-as-cooking metaphor
- Maggie Appleton — [Home-Cooked Software](https://maggieappleton.com/home-cooked-software) — adjacent framing for small, situated software
- Geoffrey Litt — [Malleable software in the age of LLMs](https://www.geoffreylitt.com/2023/03/25/llm-end-user-programming.html) — LLMs as a step change for end-user programming
- Ink & Switch — [Local-first software](https://www.inkandswitch.com/local-first/) — the data-ownership premise that makes personal tools durable
- [`the-fall-of-claude-code.md`](./the-fall-of-claude-code.md) — why closed, opaque harnesses are a bad fit for this direction
- [`agent-config`](https://github.com/averycrespi/agent-config) and [`agent-tools`](https://github.com/averycrespi/agent-tools) — my own agent-workflow version of the pattern
