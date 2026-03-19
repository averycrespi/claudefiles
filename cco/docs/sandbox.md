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
cco box template    # print the rendered lima.yaml template
```

