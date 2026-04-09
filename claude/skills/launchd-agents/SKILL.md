---
name: launchd-agents
description: Use when managing macOS launchd user agents — creating, listing, editing, deleting, reloading, or running scheduled jobs
---

# Managing Launchd

Manage macOS launchd user agents in `~/Library/LaunchAgents/`. All agents use the `com.user.<name>` naming convention and the modern `bootstrap`/`bootout` API.

## Constants

- **Plist directory:** `~/Library/LaunchAgents/`
- **Label prefix:** `com.user.`
- **Plist filename:** `com.user.<name>.plist`
- **Domain target:** `gui/$(id -u)`

## Operations

### Create

1. Parse user intent — command/script to run, schedule, and a short name
2. Generate plist XML (see Plist Template below)
3. Show the plist to the user and ask for confirmation before writing
4. Write to `~/Library/LaunchAgents/com.user.<name>.plist`
5. Bootstrap: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.<name>.plist`
6. Verify: `launchctl print gui/$(id -u)/com.user.<name>` and report status

### List

List loaded agents:

```bash
launchctl list | grep com.user
```

Also check for plist files on disk that may not be loaded:

```bash
ls ~/Library/LaunchAgents/com.user.*.plist 2>/dev/null
```

Present both — distinguish between loaded (running/waiting) and unloaded (plist exists but not bootstrapped).

### Show

Read and display the plist file:

```bash
cat ~/Library/LaunchAgents/com.user.<name>.plist
```

### Edit

1. Read the existing plist file
2. Make the requested changes
3. Show the diff to the user for confirmation
4. Write the updated plist
5. Reload (bootout + bootstrap):
   ```bash
   launchctl bootout gui/$(id -u)/com.user.<name>
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.<name>.plist
   ```
6. Verify with `launchctl print` and report status

### Delete

1. Confirm with the user before proceeding
2. Bootout: `launchctl bootout gui/$(id -u)/com.user.<name>`
3. Remove: `rm ~/Library/LaunchAgents/com.user.<name>.plist`

### Reload

Bootout and re-bootstrap an agent to pick up plist changes:

```bash
launchctl bootout gui/$(id -u)/com.user.<name>
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.<name>.plist
```

Verify with `launchctl print` afterward.

### Run Now

Trigger an immediate run regardless of schedule:

```bash
launchctl kickstart gui/$(id -u)/com.user.<name>
```

If the job is already running and needs to restart, use the `-k` flag:

```bash
launchctl kickstart -k gui/$(id -u)/com.user.<name>
```

## Plist Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.<name></string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/command</string>
        <string>arg1</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/<name>-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/<name>-stderr.log</string>
</dict>
</plist>
```

## Scheduling Keys

Use the appropriate key based on the user's scheduling needs:

- **`StartCalendarInterval`** — Cron-like schedule. Keys: `Month`, `Day`, `Weekday` (0=Sunday), `Hour`, `Minute`. Omitted keys act as wildcards. Use an array of dicts for multiple times.
- **`StartInterval`** — Run every N seconds (e.g., `<integer>3600</integer>` for hourly).
- **`WatchPaths`** — Run when any listed file path changes.
- **`KeepAlive`** — Restart the process if it exits. Set to `<true/>` for always-on services.

## Safety Rules

- Always confirm with the user before writing or deleting plist files
- Never modify plists outside `~/Library/LaunchAgents/` or not matching the `com.user.*` prefix
- If a bootstrap fails, show the error and suggest running `launchctl print gui/$(id -u)/com.user.<name>` for debugging

## Error Handling

- **Bootstrap fails with "service already loaded"**: Bootout first, then bootstrap again
- **Bootout fails with "no such service"**: The agent is not loaded — skip bootout and proceed
- **Permission denied**: Check file ownership and permissions on the plist
- **Plist syntax error**: Validate with `plutil -lint <plist-path>` before bootstrapping
