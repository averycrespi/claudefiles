# Pi Extension Improvement Findings

Prioritized suggestions from deep research comparing `pi/agent/extensions/` with `/Users/avery/Workspace/claude-code` prior art and the local `agent-engineering` references.

1. **Fix `mcp-broker` read-only enforcement first.**  
   `mcp_call` can proceed in read-only mode when the tool cache is absent (`pi/agent/extensions/mcp-broker/tools.ts:88`). Force an authoritative `listTools()` check before calls. This is a reliability/safety bug.

2. **Make workflow state durable and artifact-based.**  
   `workflow-modes` keeps core mode/baseline state in memory (`workflow-modes/index.ts:150`, `workflow-modes/index.ts:648`). Add durable artifacts like `ac.json`, `PLAN.md`, `DECISIONS.md`, `KNOWN_ISSUES.md`, phase/attempt state, and final reports. This matches the agent-engineering refs’ “structured artifacts outside conversation” guidance (`context-engineering.md:145`).

3. **Upgrade Verify mode into structured AC-based verification.**  
   Current Verify prompt says to run checks and report findings (`workflow-modes/modes.ts:141`) but has no structured verdict contract. Add per-acceptance-criterion verdicts with evidence and pass/fail-with-known-issues output. References explicitly call for AC-threaded reviewer verdicts (`workflow-patterns.md:37`, `verification.md:36`).

4. **Add a validator information barrier.**  
   Verification should consume AC/plan artifacts from disk, not the Execute agent’s handoff narrative. The refs call this out directly (`workflow-patterns.md:100`). This improves reliability by reducing self-report bias.

5. **Adopt richer tool metadata à la Claude Code.**  
   Claude Code tools declare read-only/destructive status, interrupt behavior, result-size policy, search/read/list classification, summaries, and activity descriptions (`claude-code/src/Tool.ts:404`, `Tool.ts:416`, `Tool.ts:466`, `Tool.ts:539`, `Tool.ts:546`). Add a shared Pi `defineTool` convention so renderers, safety checks, statusline, and future hooks can use consistent metadata.

6. **Generalize large-output spillover beyond `mcp-broker`.**  
   Claude persists large tool results and gives the model a preview envelope (`claude-code/src/utils/toolResultStorage.ts:189`, `toolResultStorage.ts:272`). Promote `mcp-broker/spillover.ts` into `_shared/spillover.ts` for web, subagents, bash/search outputs, and normalize empty outputs like Claude does (`toolResultStorage.ts:280`).

7. **Fix TODO durability across compaction/session restoration.**  
   TODO restore scans tool-result details/custom entries (`todo/index.ts:93`), but normal mutations only return details and only `/todo-clear` appends custom state (`todo/index.ts:123`, `todo/tools.ts:126`). Append compact `todo-state` on successful mutations.

8. **Improve subagent reliability and lifecycle UX.**  
   `spawn_agents` can throw on blank intent inside `Promise.all` (`subagents/index.ts:169`, `subagents/index.ts:183`). Prevalidate atomically and return recoverable tool errors. Then consider Claude-style background subagents (`claude-code/src/tools/AgentTool/AgentTool.tsx:87`, `AgentTool.tsx:686`) with output/log files and “don’t poll; you’ll be notified” guidance.

9. **Fix GitHub ref handling in `web_fetch`.**  
   URLs parse `blob/tree` refs (`web-access/github.ts:98`) but cloning ignores the ref and caches only owner/repo (`web-access/github.ts:244`, `web-access/github.ts:251`). Include ref in clone/cache semantics or remove advertised ref behavior.

10. **Improve command/tool-call rendering UX.**  
    Borrow Claude Bash UX: two-line/160-char display caps (`claude-code/src/tools/BashTool/UI.tsx:25`), first-line `# comment` labels (`commentLabel.ts:8`), sed-edit path summaries (`UI.tsx:99`), and queued/running/result states (`UI.tsx:145`). Apply especially to `compact-tools/bash` and grouped `spawn_agents` rendering.

11. **Add mechanical runaway guardrails to Execute mode.**  
    Add optional diff budgets and no-delta/idle iteration warnings or handoff blockers. The refs recommend these to catch gold-plating/thrash (`workflow-patterns.md:156`).

12. **Make statusline more actionable.**  
    Extend beyond cwd/model/context/quota with current wait reason, active tool/subagent count, session duration/tool count, and warning thresholds. Claude tracks cost/duration and waiting states; Pi can approximate even if exact cost events aren’t exposed.

13. **Harden cancellation propagation.**  
    Audit tools that ignore abort signals, especially UI/process waits. The Pi audit found gaps in `autoformat` and `ask-user`; reliability improves when long waits and child processes clean up predictably.

14. **Add hook-style extension points later, but gate by trust.**  
    Claude hooks use structured output (`claude-code/src/types/hooks.ts:49`), parallel timeouts (`claude-code/src/utils/hooks.ts:2142`), permission precedence (`hooks.ts:2820`), and workspace trust gating (`hooks.ts:3029`). This is high leverage, but only after core state/safety fixes.
