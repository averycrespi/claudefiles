# Configuration

cco uses a JSON config file for optional settings. The file location respects `$XDG_CONFIG_HOME`:

```
~/.config/cco/config.json
```

## Managing the Config

```sh
cco config path     # print config file location
cco config show     # print config contents
cco config init     # create config with defaults (if not exists)
cco config edit     # open in $EDITOR (runs init first)
```

## Go Module Proxy

When pushing Go projects to the sandbox, private module dependencies can't be resolved because the sandbox has no access to private repositories. The `go_proxy` setting caches matching dependencies on the host before push, making them available inside the sandbox via a file-system based Go module proxy.

```json
{
  "go_proxy": {
    "patterns": [
      "github.com/myorg/*"
    ]
  }
}
```

**How it works:**

1. At push time, cco scans all `go.mod` files in the worktree
2. Dependencies matching any pattern are downloaded to the job's exchange directory
3. Inside the sandbox, `GOPROXY` is set to check the local cache first, then fall back to `proxy.golang.org`

Patterns use the same glob format as Go's `GOPRIVATE` environment variable. If `go_proxy` is absent or `patterns` is empty, push behaves as before.
