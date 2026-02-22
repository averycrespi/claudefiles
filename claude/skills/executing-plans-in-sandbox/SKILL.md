---
name: executing-plans-in-sandbox
description: Use when you have a written implementation plan file to execute in the sandbox VM - pushes plan to sandbox, waits for results, reintegrates
---

# Executing Plans in Sandbox

## Overview

Execute implementation plans autonomously in a sandbox VM. Pushes the plan and current branch into the sandbox, where Claude Code runs the full executing-plans workflow unattended. Pulls results back when complete.

**Core principle:** Full isolation in a disposable VM — best for autonomous work where you don't want to block the host.

**Announce at start:** "I'm using the executing-plans-in-sandbox skill to run this plan in the sandbox."

## The Process

### Step 1: Push Plan to Sandbox

1. Validate the plan file path exists
2. Run `cco box push <plan-path>`
3. Capture the job ID from the output (format: `job <ID> started`)

### Step 2: Wait for Results

1. Run `cco box pull <job-id>`
2. This blocks up to 30 minutes, polling for the output bundle
3. On success, results are fast-forward merged into the current branch

### Step 3: Complete Development

**REQUIRED SUB-SKILL:** Use Skill(completing-work)
