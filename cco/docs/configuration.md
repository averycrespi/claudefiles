# Configuration

cco uses a JSON config file for optional settings. The file location respects `$XDG_CONFIG_HOME`:

```
~/.config/cco/config.json
```

## Managing the Config

```sh
cco config path     # print config file location
cco config show     # print config contents
cco config refresh  # create or refresh config with latest defaults
cco config edit     # open in $EDITOR (runs init first)
```

