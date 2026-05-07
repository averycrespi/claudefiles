# Pi Extension Improvement Findings

Prioritized suggestions from deep research comparing `pi/agent/extensions/` with `/Users/avery/Workspace/claude-code` prior art and the local `agent-engineering` references.

1. **Fix `mcp-broker` read-only enforcement first.**  
   `mcp_call` can proceed in read-only mode when the tool cache is absent (`pi/agent/extensions/mcp-broker/tools.ts:88`). Force an authoritative `listTools()` check before calls. This is a reliability/safety bug.

   **Decision:** Accepted. Implement first.

   **Implementation notes:** In read-only mode, `mcp_call` should call `client.listTools()` before invocation and reject tools not present in the filtered read-only list with a recoverable tool-result error. Add tests for read-only empty-cache rejection of write tools, read-only empty-cache allowance of read-only tools, and unchanged normal-mode behavior.

2. **Make workflow state durable and artifact-based.**  
   `workflow-modes` keeps core mode/baseline state in memory (`workflow-modes/index.ts:150`, `workflow-modes/index.ts:648`). Add durable artifacts like `ac.json`, `PLAN.md`, `DECISIONS.md`, `KNOWN_ISSUES.md`, phase/attempt state, and final reports. This matches the agent-engineering refs’ “structured artifacts outside conversation” guidance (`context-engineering.md:145`).

   **Decision:** Skipped.

   **Rationale:** The reliability benefits are real, especially across compaction/session restoration and for later verification barriers, but the work is too likely to grow into an overbuilt workflow artifact system. Do not pursue unless a narrower future need emerges.

3. **Upgrade Verify mode into structured AC-based verification.**  
   Current Verify prompt says to run checks and report findings (`workflow-modes/modes.ts:141`) but has no structured verdict contract. Add per-acceptance-criterion verdicts with evidence and pass/fail-with-known-issues output. References explicitly call for AC-threaded reviewer verdicts (`workflow-patterns.md:37`, `verification.md:36`).

   **Decision:** Accepted, prompt-only.

   **Implementation notes:** Update the Verify mode prompt to require a concise structured report: overall verdict (`pass`, `fail`, or `blocked`), deterministic checks run with results, per-acceptance-criterion verdicts (`pass`, `fail`, `n/a`, or `unknown`) with evidence, findings/next actions, and any user-accepted known issues. Do not add new artifact machinery as part of this finding.

4. **Add a validator information barrier.**  
   Verification should consume AC/plan artifacts from disk, not the Execute agent’s handoff narrative. The refs call this out directly (`workflow-patterns.md:100`). This improves reliability by reducing self-report bias.

   **Decision:** Skipped.

   **Rationale:** A true information barrier depends on durable AC/plan artifacts, which are not being added. Revisit only if workflow artifacts are introduced later.

5. **Adopt richer tool metadata à la Claude Code.**  
   Claude Code tools declare read-only/destructive status, interrupt behavior, result-size policy, search/read/list classification, summaries, and activity descriptions (`claude-code/src/Tool.ts:404`, `Tool.ts:416`, `Tool.ts:466`, `Tool.ts:539`, `Tool.ts:546`). Add a shared Pi `defineTool` convention so renderers, safety checks, statusline, and future hooks can use consistent metadata.

   **Decision:** Skipped.

   **Rationale:** This is architectural and only pays off if many extensions or Pi core conventions adopt it. Current accepted work is more targeted. Revisit only if there is a concrete consumer for richer metadata, starting with a tiny helper and one migrated extension.

6. **Generalize large-output spillover beyond `mcp-broker`.**  
   Claude persists large tool results and gives the model a preview envelope (`claude-code/src/utils/toolResultStorage.ts:189`, `toolResultStorage.ts:272`). Promote `mcp-broker/spillover.ts` into `_shared/spillover.ts` for web, subagents, bash/search outputs, and normalize empty outputs like Claude does (`toolResultStorage.ts:280`).

   **Decision:** Accepted, shared-helper first.

   **Implementation notes:** Move/copy `mcp-broker/spillover.ts` into `_shared/spillover.ts` and update `mcp-broker` to import the shared helper without changing behavior. Do not retrofit every tool at once. Migrate additional extensions opportunistically when there is a clear large-output risk, likely `subagents` first.

7. **Fix TODO durability across compaction/session restoration.**  
   TODO restore scans tool-result details/custom entries (`todo/index.ts:93`), but normal mutations only return details and only `/todo-clear` appends custom state (`todo/index.ts:123`, `todo/tools.ts:126`). Append compact `todo-state` on successful mutations.

   **Decision:** Accepted.

   **Implementation notes:** After every successful mutating `todo` action (`set`, `add`, `update`, `remove`, `clear`), append a compact custom `todo-state` session entry. Do not append on `list` or failed mutations. Keep returning state in tool-result `details` for backward compatibility.

8. **Improve subagent reliability and lifecycle UX.**  
   `spawn_agents` can throw on blank intent inside `Promise.all` (`subagents/index.ts:169`, `subagents/index.ts:183`). Prevalidate atomically and return recoverable tool errors. Then consider Claude-style background subagents (`claude-code/src/tools/AgentTool/AgentTool.tsx:87`, `AgentTool.tsx:686`) with output/log files and “don’t poll; you’ll be notified” guidance.

   **Decision:** Accepted, validation-only.

   **Implementation notes:** Prevalidate all `agents[]` before spawning and return one recoverable tool-result error listing all validation problems, especially blank `intent` values and unknown agent types. Do not pursue background subagents as part of this finding; existing activity tracking, abort propagation, temp logs, and recursion guard are sufficient for now.

9. **Fix GitHub ref handling in `web_fetch`.**  
   URLs parse `blob/tree` refs (`web-access/github.ts:98`) but cloning ignores the ref and caches only owner/repo (`web-access/github.ts:244`, `web-access/github.ts:251`). Include ref in clone/cache semantics or remove advertised ref behavior.

   **Decision:** Accepted.

   **Implementation notes:** Make GitHub fetch ref-aware: include a sanitized ref in the clone/cache path when `gh.ref` exists, clone/fetch that ref when possible, and include ref semantics in returned text/clonePath behavior. Add tests for blob/tree URLs with refs so branch/tag/commit URLs do not silently read the default branch.

10. **Improve command/tool-call rendering UX.**  
    Borrow Claude Bash UX: two-line/160-char display caps (`claude-code/src/tools/BashTool/UI.tsx:25`), first-line `# comment` labels (`commentLabel.ts:8`), sed-edit path summaries (`UI.tsx:99`), and queued/running/result states (`UI.tsx:145`). Apply especially to `compact-tools/bash` and grouped `spawn_agents` rendering.

    **Decision:** Skipped.

    **Rationale:** Existing compact renderers and subagent activity rendering already cover the main UX need. The remaining ideas are polish and should be split into specific UI tickets if revisited.

11. **Add mechanical runaway guardrails to Execute mode.**  
    Add optional diff budgets and no-delta/idle iteration warnings or handoff blockers. The refs recommend these to catch gold-plating/thrash (`workflow-patterns.md:156`).

    **Decision:** Skipped.

    **Rationale:** Useful for autonomous long-running execution, but too much machinery for current workflow-modes scope. Existing loop discipline includes auto-handoff fix caps, TODO reminders, and compaction summaries. Revisit only for a more autonomous execution harness.

12. **Make statusline more actionable.**  
    Extend beyond cwd/model/context/quota with current wait reason, active tool/subagent count, session duration/tool count, and warning thresholds. Claude tracks cost/duration and waiting states; Pi can approximate even if exact cost events aren’t exposed.

    **Decision:** Skipped.

    **Rationale:** Current statusline already covers workflow mode, cwd, quota/usage, context, model, and thinking level. Additional wait/activity tracking requires broader event plumbing. Revisit incrementally only if a concrete consumer emerges, such as active subagent count.

13. **Harden cancellation propagation.**  
    Audit tools that ignore abort signals, especially UI/process waits. The Pi audit found gaps in `autoformat` and `ask-user`; reliability improves when long waits and child processes clean up predictably.

    **Decision:** Accepted, narrow scope.

    **Implementation notes:** Prioritize `ask_user`, which currently ignores the tool abort signal while waiting in `ctx.ui.custom`; abort should resolve as cancelled and clean up UI. When implementing GitHub ref handling in `web_fetch`, also pass abort signals through GitHub clone/fetch `execFile` calls if practical. Do not run a broad cancellation audit as part of this finding.

14. **Add hook-style extension points later, but gate by trust.**  
    Claude hooks use structured output (`claude-code/src/types/hooks.ts:49`), parallel timeouts (`claude-code/src/utils/hooks.ts:2142`), permission precedence (`hooks.ts:2820`), and workspace trust gating (`hooks.ts:3029`). This is high leverage, but only after core state/safety fixes.

    **Decision:** Skipped.

    **Rationale:** This is a large Pi core/platform feature, not a focused extension improvement. It requires a security model, trust semantics, permission precedence, timeout behavior, and documentation. Do not mix it with the accepted targeted fixes.
