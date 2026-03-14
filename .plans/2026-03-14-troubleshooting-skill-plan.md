# Troubleshooting Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use Skill(executing-plans) to implement this plan task-by-task.

**Goal:** Create a "battle buddy" skill for incident response that investigates alongside the user, pursuing multiple hypotheses in parallel via subagents while maintaining fluid interactive dialogue.

**Architecture:** Single SKILL.md with a references/ directory containing the investigator subagent prompt template. The skill orchestrates parallel investigation subagents, synthesizes their findings into a hypothesis board, and iterates with the user until resolution.

**Tech Stack:** Claude Code skill (SKILL.md + references), Agent tool for parallel subagents, AskUserQuestion for interactive flow.

---

### Task 1: Initialize Skill Directory

**Files:**
- Create: `claude/skills/troubleshooting/SKILL.md`
- Create: `claude/skills/troubleshooting/references/investigator-prompt.md`

**Step 1: Run init_skill.py to scaffold the skill**

Run: `cd /Users/averycrespi/claudefiles && python3 claude/skills/creating-skills/scripts/init_skill.py troubleshooting --path claude/skills/troubleshooting`
Expected: Directory created with SKILL.md template and example subdirectories

**Step 2: Remove unused example directories and files**

Delete any example files in `scripts/`, `assets/`, and the example files in `references/` that were created by the scaffold. Keep the `references/` directory itself since we'll use it for the investigator prompt.

Run: `ls claude/skills/troubleshooting/`
Expected: Only SKILL.md and references/ remain (plus any LICENSE/ATTRIBUTION files)

**Step 3: Commit**

```bash
git add claude/skills/troubleshooting/
git commit -m "feat(troubleshooting): scaffold skill directory"
```

---

### Task 2: Write the Investigator Subagent Prompt Template

**Files:**
- Create: `claude/skills/troubleshooting/references/investigator-prompt.md`

**Step 1: Write the investigator prompt template**

This is the prompt dispatched to each parallel investigation subagent. It follows the pattern from verifying-work's reviewer prompts — structured input, constrained output format.

Write `claude/skills/troubleshooting/references/investigator-prompt.md` with this content:

```markdown
# Hypothesis Investigator

## Assignment

Investigate this hypothesis about an ongoing incident:

**Hypothesis:** {{HYPOTHESIS}}

**Problem context:** {{PROBLEM_CONTEXT}}

**Investigation instructions:** {{INVESTIGATION_INSTRUCTIONS}}

## Rules

- Read-only investigation. Do NOT modify any code, configuration, or system state.
- Focus on finding evidence that SUPPORTS or ELIMINATES the hypothesis.
- If evidence is ambiguous, say so — do not force a conclusion.
- Stay focused on your assigned hypothesis. Note related observations but do not go down tangents.

## Available Tools

Use any read-only tools available to you:
- Read files, grep code, check git history
- Search Datadog logs via `~/.claude/skills/searching-datadog-logs/scripts/search_logs`
- Search Confluence/Jira via Atlassian MCP
- Fetch web pages (status pages, docs) via WebFetch
- Any other read-only investigation

## Output Format

Return your findings in EXACTLY this format:

```
VERDICT: <SUPPORTED | ELIMINATED | INCONCLUSIVE>
CONFIDENCE: <low | medium | high>

EVIDENCE:
- <what you checked and what you found>
- <what you checked and what you found>
...

SUMMARY: <1-2 sentence summary of findings>

NEXT_STEPS: <optional — suggested follow-up investigation if INCONCLUSIVE or if new leads emerged>
```

Do not include any other text before VERDICT.
```

**Step 2: Verify the file was written correctly**

Run: `cat claude/skills/troubleshooting/references/investigator-prompt.md | head -5`
Expected: First 5 lines match the template header

**Step 3: Commit**

```bash
git add claude/skills/troubleshooting/references/investigator-prompt.md
git commit -m "feat(troubleshooting): add investigator subagent prompt"
```

---

### Task 3: Write SKILL.md

**Files:**
- Modify: `claude/skills/troubleshooting/SKILL.md`

**Step 1: Write the SKILL.md with frontmatter and full instructions**

Replace the scaffold SKILL.md content with the full skill. The skill should have these sections:

**Frontmatter:**
```yaml
---
name: troubleshooting
description: Use when troubleshooting a system issue, investigating an outage, debugging a production problem, or responding to an incident
---
```

**Body sections (in order):**

1. **Title & Overview** — "Battle Buddy for Incident Response". One paragraph: fluid dialogue, parallel investigation via subagents, hypothesis board tracking.

2. **Phase 1: Problem Intake** — Accept whatever the user provides (error message, alert, description). Ask 1-2 clarifying questions max to form initial hypotheses. Questions to consider: when did it start, recent changes, blast radius. Use `AskUserQuestion` for structured questions when appropriate, conversational for open-ended.

3. **Phase 2: Hypothesis Generation** — Generate 3-5 initial hypotheses from available context. Present as a hypothesis board using this format:
   ```
   ## Hypothesis Board
   1. 🔍 [hypothesis]  [Investigating]  confidence: medium
   2. 🔍 [hypothesis]  [Investigating]  confidence: medium
   3. ⏳ [hypothesis]  [Queued]
   ```
   Status icons: 🔍 Investigating, ⏳ Queued, ✅ Supported, ❌ Eliminated, ❓ Inconclusive

4. **Phase 3: Parallel Investigation** — Dispatch 2-4 subagents in a SINGLE message using the Agent tool. Each subagent gets:
   - The investigator prompt template from `./references/investigator-prompt.md` with placeholders filled
   - A specific hypothesis to investigate
   - Specific investigation instructions (what tools to use, what to look for)

   Subagent dispatch pattern:
   ```
   Agent tool (general-purpose):
     description: "Investigate: [hypothesis summary]"
     prompt: [filled investigator-prompt.md template]
   ```

   Available investigation tools for subagents:
   - Code & git: git log, git diff, grep, Read files
   - Datadog: `~/.claude/skills/searching-datadog-logs/scripts/search_logs`
   - Jira/Confluence: Atlassian MCP calls
   - Web: WebFetch for status pages, docs
   - Note: subagents CANNOT use AskUserQuestion — only the main agent asks the user

5. **Phase 4: Synthesize & Iterate** — After subagents return:
   - Parse each subagent's VERDICT, CONFIDENCE, EVIDENCE, and NEXT_STEPS
   - Update the hypothesis board
   - Present findings conversationally to the user — what was found, what was eliminated, what's still unclear
   - Ask the user: do they have additional context? Are they seeing anything on their end?
   - Based on findings + user input, decide next action:
     - Dispatch new subagents for follow-up investigation
     - Refine or add hypotheses based on new evidence
     - Move to resolution if root cause is identified
   - Repeat this cycle as needed

6. **Phase 5: Resolution** — When root cause is identified:
   - Propose mitigation with rationale and risks
   - For code fixes: write the fix (with user approval)
   - For operational actions: provide exact commands but user executes
   - Verify fix by re-checking the signals that showed the problem
   - Session can end at any point — partial progress is fine, no forced closure

7. **Safety Rules** section:
   - Subagents are read-only — never mutate code, config, or systems
   - Mutating actions (rollback, restart, deploy, config change) require explicit user approval
   - Always ask: "is this action safe in THIS context?"

8. **Key Principles** section:
   - One question at a time — don't overwhelm during an incident
   - Pursue multiple hypotheses in parallel — don't go sequential
   - Evidence over intuition — check before concluding
   - Stay focused — investigate the incident, don't refactor or clean up
   - Adapt to the user — they may have context you don't, listen for it

**Step 2: Verify skill file is well-formed**

Run: `head -3 claude/skills/troubleshooting/SKILL.md`
Expected: Shows YAML frontmatter with `---`, `name: troubleshooting`, `description: Use when...`

**Step 3: Commit**

```bash
git add claude/skills/troubleshooting/SKILL.md
git commit -m "feat(troubleshooting): write skill instructions"
```

---

### Task 4: Register Skill in Settings and Update Docs

**Files:**
- Modify: `claude/settings.json` (if skill registration is needed)
- Modify: `docs/skills.md`

**Step 1: Check if skill auto-discovery works or if registration is needed**

Read `claude/settings.json` and check if skills are explicitly registered or auto-discovered from the skills directory.

Run: `grep -c "troubleshooting\|skills" claude/settings.json | head -5`
Expected: Determine whether explicit registration is needed

**Step 2: If explicit registration is needed, add the troubleshooting skill to settings.json**

Follow the same pattern used by other skills in settings.json.

**Step 3: Update docs/skills.md**

Add the troubleshooting skill to the "Workflow Skills" table:

```markdown
| `troubleshooting` | Battle buddy for incident response and system troubleshooting |
```

Insert it after the `reviewing-prs` row in the Workflow Skills table.

**Step 4: Verify docs look correct**

Run: `cat docs/skills.md`
Expected: New row appears in the Workflow Skills table

**Step 5: Commit**

```bash
git add docs/skills.md claude/settings.json
git commit -m "docs: add troubleshooting skill to catalog"
```

---

### Task 5: Run setup.sh and Validate

**Files:**
- No new files

**Step 1: Run setup.sh to symlink the new skill**

Run: `cd /Users/averycrespi/claudefiles && ./setup.sh`
Expected: stow creates symlinks for the new skill files into `~/.claude/skills/troubleshooting/`

**Step 2: Verify symlinks exist**

Run: `ls -la ~/.claude/skills/troubleshooting/`
Expected: SKILL.md and references/ are symlinked

**Step 3: Verify the investigator prompt is accessible**

Run: `head -3 ~/.claude/skills/troubleshooting/references/investigator-prompt.md`
Expected: Shows the investigator prompt header

**Step 4: Commit (if setup.sh modified anything)**

Only commit if setup.sh changed tracked files (unlikely — it manages symlinks via stow).

```bash
git status
# Only commit if there are changes to tracked files
```
