# workflow-modes API

Programmatic integration surface for the `workflow-modes` extension.

Import from `api.ts`:

```ts
import {
  WORKFLOW_MODE_CHANGED_EVENT,
  type WorkflowModeState,
} from "../workflow-modes/api.ts";
```

Anything not exported from `api.ts` should be treated as internal.

## Event bus contract

The extension publishes workflow-mode changes over `pi.events`.

### `WORKFLOW_MODE_CHANGED_EVENT`

String event name emitted whenever the active workflow mode changes or resets:

- `/plan`, `/execute`, `/verify`
- `/normal`
- `session_start`
- `session_tree`
- `session_shutdown`

Subscribe like this:

```ts
pi.events.on(WORKFLOW_MODE_CHANGED_EVENT, (data) => {
  const state = data as WorkflowModeState;
  // react to state.mode / state.baseThinking / state.baselineThinking
});
```

## Types

### `WorkflowModeState`

```ts
interface WorkflowModeState {
  mode: "normal" | "plan" | "execute" | "verify";
  baseThinking?: "medium" | "high" | "low";
  baselineThinking?: string;
}
```

Notes:

- `mode` is always present.
- `baseThinking` is the mode's default thinking level.
- `baselineThinking` is the session's original thinking level captured before the first workflow-mode transition.
- `baseThinking` and `baselineThinking` are `undefined` in `normal` mode.
