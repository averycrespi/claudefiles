# Usage extension

This extension shows provider usage in Pi's footer.

## Current providers

- `openai-codex` — polls the ChatGPT/Codex usage endpoint

## File layout

- `index.ts` — extension entry point and footer update logic
- `codex.ts` — Codex provider implementation
- `utils.ts` — shared types and formatting helpers

## Adding a new provider

1. create a new adapter file, e.g. `anthropic.ts`
2. export a `ProviderAdapter`
3. import it in `index.ts`
4. add it to the `ADAPTERS` array

This keeps provider-specific logic isolated and makes future additions easier.
