# ask-user

Pi extension that provides an `ask_user` tool for interactive multiple-choice decisions.

## Tools

### `ask_user`

Ask the user a multiple-choice question and return their answer. Use when multiple valid approaches exist with meaningfully different trade-offs. Do not use for trivial confirmations.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | yes | The question to ask |
| `context` | string | no | Additional framing shown above the options |
| `options` | array | yes | 2–5 choices, each with a `label` (required) and `description` (optional) |
| `recommended` | integer | no | 0-indexed option to mark as "(Recommended)" |

An "Other (type your own)" option is always appended automatically — do not include one in `options`.

**Returns** one of:
- `"User selected: 2. Option Name"` — chosen option with its 1-based index
- `"User wrote: <text>"` — free-text answer via the Other path
- `"User cancelled — no option selected."` — user pressed Escape

The `details` object contains `{ cancelled, answerLabel, answerIndex, isCustom }` for structured access by other extensions.

## UI behavior

Renders a custom TUI widget at the bottom of the terminal:

- Options are numbered (1, 2, 3…) and navigated with ↑↓ arrows
- Enter selects the highlighted option
- Selecting "Type something." opens an inline editor; Escape returns to the list without cancelling
- Escape from the option list cancels the prompt
- The recommended option is labelled "(Recommended)"
- Option descriptions appear below their label in muted text
- Context (if provided) appears between the question and the options

In non-interactive mode (`!ctx.hasUI`) the tool returns an error immediately.
