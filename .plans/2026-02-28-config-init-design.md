# Design: `cco config init` Command

## Problem

`cco config edit` creates an empty `{}` when the config file doesn't exist. This gives users no indication of what fields are available or what the expected structure looks like.

## Solution

Add a `cco config init` command that creates the config file with sensible defaults, and have `config edit` call it instead of creating an empty file.

## Changes

### 1. `config.Default()` function (`internal/config/config.go`)

New function returning a `*Config` with default values:

```go
func Default() *Config {
    return &Config{
        GoProxy: GoProxyConfig{
            Patterns: []string{},
        },
    }
}
```

This produces:

```json
{
  "go_proxy": {
    "patterns": []
  }
}
```

### 2. `config.Init()` function (`internal/config/config.go`)

New function that creates the config file if it doesn't exist:

```go
func Init(logger logging.Logger) error
```

Behavior:
- If config file already exists: log info message, return nil (no-op)
- If config file doesn't exist:
  1. Create config directory with `os.MkdirAll`
  2. Marshal `Default()` to indented JSON
  3. Write to `ConfigFilePath()`
  4. Log info message confirming creation

Returns error only on filesystem failures.

### 3. `cco config init` subcommand (`cmd/config.go`)

New cobra command:

```go
var configInitCmd = &cobra.Command{
    Use:   "init",
    Short: "Initialize config file with defaults",
    Args:  cobra.NoArgs,
    RunE: func(cmd *cobra.Command, args []string) error {
        logger := logging.NewStdLogger(verbose)
        return config.Init(logger)
    },
}
```

Register in `init()`: `configCmd.AddCommand(configPathCmd, configShowCmd, configEditCmd, configInitCmd)`

### 4. Modify `config edit` (`cmd/config.go`)

Replace the inline file-creation block with:

```go
RunE: func(cmd *cobra.Command, args []string) error {
    logger := logging.NewStdLogger(verbose)
    if err := config.Init(logger); err != nil {
        return err
    }
    // ... open editor as before
}
```

## Testing

- `config.Default()` — returns expected struct
- `config.Init()` with no existing file — creates file with default JSON
- `config.Init()` with existing file — no-op, file unchanged
- `config.Init()` directory creation — creates parent dirs as needed
