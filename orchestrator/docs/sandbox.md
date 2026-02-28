# Sandbox

`cco box` manages an isolated [Lima](https://github.com/lima-vm/lima) VM for running Claude Code safely. This is useful for executing plans autonomously without risking your host environment.

The sandbox is persistent — data and installed packages survive restarts. The first boot takes several minutes to install Docker, language runtimes, and dev tools. Subsequent starts are fast.

**Requirements:** Lima (`brew install lima`)

## Setup

**Create the sandbox (first time only):**

```sh
cco box create
```

**Authenticate Claude Code (first time only):**

```sh
cco box shell
claude --dangerously-skip-permissions
```

## Lifecycle

```sh
cco box start       # start the VM
cco box stop        # stop the VM
cco box destroy     # remove the VM entirely
cco box status      # check VM status
cco box provision   # re-provision after updating configs
```

## Push / Pull

Push a plan into the sandbox for autonomous execution, then pull the results back:

```sh
cco box push .plans/2026-02-21-my-feature-plan.md
# Job a3f7b2 started. Pull with: cco box pull a3f7b2

cco box pull a3f7b2
```

Push requires a workspace (`cco add <branch>`) for the current branch. It creates a git bundle, clones it inside the VM, and launches Claude in a split tmux pane to execute the plan. Push returns immediately — Claude runs in the background pane. When Claude finishes, it writes an output bundle. Pull polls for that bundle, fast-forward merges the commits back onto your branch, and closes the sandbox pane.

Each push gets a unique job ID so multiple jobs can run in parallel.
