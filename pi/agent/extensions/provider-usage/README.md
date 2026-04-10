# provider-usage

Pi extension that displays provider rate-limit quota in the footer.

## Footer format

```
Codex: 45% (20%) · resets in 2h 30m (3d 12h)
Codex: limit reached · resets in 2h 30m
Codex: $4.20 · resets in 1h 15m
```

Shows the current provider's short and weekly window usage as paired percentages and reset timers. When only one window is available, the format degrades gracefully to a single value. When the hard limit is reached, the reset timer is still shown so you know when quota returns. Credit-based plans show the balance instead of a percentage.

The footer updates on session start and after each turn, debounced to one API call per 60 seconds.

## Current providers

- `openai-codex` — polls the ChatGPT/Codex usage endpoint

## Adding a new provider

1. Create a new adapter file, e.g. `anthropic.ts`
2. Export a `ProviderAdapter` (see `utils.ts` for the interface)
3. Import it in `index.ts` and add it to the `ADAPTERS` array

Each adapter handles provider detection (`handles`) and API-specific fetching (`fetchUsage`), returning a normalized `UsageStats` object.

## File layout

- `index.ts` — extension entry point, event wiring, and footer updates
- `codex.ts` — Codex provider adapter
- `utils.ts` — `ProviderAdapter` interface, `UsageStats` type, and formatting helpers

## Inspiration

- [marckrenn/pi-sub/sub-bar](https://github.com/marckrenn/pi-sub/tree/main/packages/sub-bar) — multi-provider usage widget with theming, widget/status placement options, and a settings system
- [ifiokjr/oh-pi/usage-tracker](https://github.com/ifiokjr/oh-pi/blob/main/packages/extensions/extensions/usage-tracker.ts) — per-session cost tracking, pacing analysis, dashboard overlay, and inter-extension event broadcasting
