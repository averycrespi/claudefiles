---
name: assisting-research
description: Use when running open-ended, multi-session technical research that requires experiments, evidence gathering, and an accumulating HTML report
---

# Researching

## Overview

Run structured, multi-session technical research where findings accumulate over time into an HTML report. Maintain a three-layer separation — raw artifacts (scripts, logs), distilled evidence (findings), and narrative synthesis (report) — so that results are reproducible, shareable, and naturally transformable into other document formats.

Act as a research assistant: design experiments, process results, maintain evidence files, and build the report. The user executes experiments against real systems and drives the research direction.

## When to Use

- The question cannot be answered in a single session or with a single experiment
- Findings from one experiment inform the design of the next
- Results need to be shared with others or transformed into a formal document
- There is value in reproducing the experiments later

## Directory Structure

Initialize the research workspace at `.research/{topic}/`:

```
.research/{topic}/
  evidence/              # Distilled findings, one file per discovery
  experiments/           # Runnable scripts
    results/             # Raw logs, query output, benchmark data
  report.html            # Running HTML report
```

## Three-Layer Separation

### Layer 1: Experiments (`experiments/`)

Experiment scripts are the lab notebook. Each script should be:

- **Self-contained** — runnable without external context
- **Timestamped** — output files include timestamps (e.g., `results/benchmark-20260316-141635.log`)
- **Documented** — a comment block at the top explaining what it tests and why

Name scripts by purpose, not by sequence: `benchmark-before-after.sh` not `experiment-3.sh`. A reader should understand the purpose from the filename.

Raw output goes in `experiments/results/`. Never edit raw output — it is the immutable record.

### Layer 2: Evidence (`evidence/`)

Evidence files distill raw output into findings. One file per discovery, not one file per experiment. An experiment might produce multiple findings, or multiple experiments might contribute to one finding.

Use the evidence template in `references/evidence-template.md` for consistent structure.

Name evidence files by what was discovered: `cache-invalidation-timing-2026-03-23.md` not `experiment-3-results.md`.

**Key principle:** Evidence files are the source of truth. The report references and synthesizes them. This separation means the narrative can be rearranged later without losing the underlying data.

### Layer 3: Report (`report.html`)

The running HTML report accumulates evidence into a narrative. Add sections incrementally as the research progresses — do not rewrite from scratch each time.

Initialize the report using the HTML template in `references/report-skeleton.html`. The template includes a CSS design system with callouts, tables, code blocks, stat cards, tags, and section navigation.

The report should:

- Start with a problem statement and what is known
- Add sections as experiments produce findings
- Reference evidence files and raw data rather than duplicating them
- Maintain an "open questions" section that drives the next experiment
- Be readable by someone who has not followed the research in real time

## Workflow

### 1. Initialize

Create the directory structure. Write the initial report from the skeleton template with:

- Problem statement
- What is currently known
- Constraints and requirements
- Open questions to investigate

### 2. Design Experiment

Based on current open questions, design the next experiment:

- What hypothesis is being tested?
- What will be measured?
- What does success/failure look like?

Write a self-contained experiment script with a comment block explaining the hypothesis and approach. Present the script to the user for execution.

### 3. User Runs, Claude Processes

The user executes the experiment and provides the raw output. Then:

- Store raw output in `experiments/results/` with timestamps
- Distill findings into one or more evidence files in `evidence/`
- Update the report with a new findings section referencing the evidence
- Update the open questions — remove answered ones, add new ones that arose

### 4. Iterate

Review open questions. If unanswered questions remain that matter, go back to step 2. If the research has converged on an answer, the report is the deliverable.

## Anti-patterns

- **Don't put raw data in evidence files.** Evidence files contain findings and analysis. Raw query output, full benchmark logs, etc. belong in `experiments/results/`.
- **Don't put claims in the report that aren't backed by evidence.** If a claim does not trace back to an evidence file, it should.
- **Don't design all experiments upfront.** The point of the iterative loop is that each experiment's findings inform the next. Over-planning leads to running experiments that don't matter.
- **Don't skip the evidence layer.** It is tempting to go straight from raw output to report. The evidence layer forces distillation and makes the report easier to write and maintain.
- **Don't rewrite the report from scratch.** Add sections incrementally. The chronological accumulation of findings is itself valuable — it shows how understanding evolved.

## Key Principles

- **One question at a time** — do not overwhelm the user with multiple questions
- **Evidence over intuition** — check before concluding, show the evidence
- **Name things by what they are** — not by sequence number
- **Raw output is immutable** — never edit it after recording
- **The user drives** — Claude designs and processes, the user executes and decides

## References

### references/evidence-template.md

Template for writing evidence files with consistent structure.

### references/report-skeleton.html

HTML template with CSS design system for initializing research reports.
