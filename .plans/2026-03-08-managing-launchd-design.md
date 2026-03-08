# Managing Launchd — Design

## Purpose

A Claude Code skill for managing macOS launchd user agents. Covers creating, listing, showing, editing, deleting, reloading, and immediately running scheduled jobs — all scoped to `~/Library/LaunchAgents/` with a `com.user.*` naming convention.

## Scope

- **User agents only** — `~/Library/LaunchAgents/`, no sudo required
- **Naming convention** — `com.user.<name>` labels, `com.user.<name>.plist` filenames
- **No helper scripts** — uses `launchctl` directly
- **Pure SKILL.md** — instructional skill with no bundled scripts or assets

## Operations

| Operation    | launchctl Command                                          |
| ------------ | ---------------------------------------------------------- |
| **Create**   | Write plist, `launchctl bootstrap gui/$(id -u) <path>`    |
| **List**     | `launchctl list \| grep com.user`                          |
| **Show**     | Read the plist file                                        |
| **Edit**     | Modify plist, bootout + bootstrap                          |
| **Delete**   | `launchctl bootout gui/$(id -u)/<label>`, remove plist     |
| **Reload**   | Bootout + bootstrap                                        |
| **Run now**  | `launchctl kickstart [-k] gui/$(id -u)/<label>`            |

Uses modern `bootstrap`/`bootout` API, not deprecated `load`/`unload`.

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

### Common Scheduling Keys

- `StartCalendarInterval` — cron-like (Hour, Minute, Weekday, Day, Month)
- `StartInterval` — run every N seconds
- `WatchPaths` — run when a file changes
- `KeepAlive` — restart if process exits

## Workflows

### Create

1. Parse user intent (command, schedule, name)
2. Generate plist XML
3. Show plist to user for confirmation
4. Write to `~/Library/LaunchAgents/com.user.<name>.plist`
5. Bootstrap with `launchctl bootstrap gui/$(id -u) <path>`
6. Verify with `launchctl print` and report status

### Edit

1. Read existing plist file
2. Make requested changes
3. Show diff to user
4. Write updated plist
5. Reload (bootout + bootstrap)
6. Verify and report status

### Delete

1. Confirm with user before proceeding
2. Bootout the agent
3. Remove the plist file

### Run Now

1. Run `launchctl kickstart gui/$(id -u)/com.user.<name>`
2. Use `-k` flag if the job is already running and needs to restart
3. Report status

## Safety Rules

- Always confirm before writing or deleting plist files
- Never modify plists outside `~/Library/LaunchAgents/` or not matching `com.user.*` prefix
- When listing, distinguish between loaded (running/waiting) and unloaded agents
- If a bootstrap fails, show the error and suggest `launchctl print` for debugging
