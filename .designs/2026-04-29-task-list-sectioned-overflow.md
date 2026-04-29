# Task-list widget: sectioned overflow rendering

## Summary

Redesign the `task-list` widget's overflow behavior from a single flat priority list into a compact three-section layout that better answers three user questions:

1. What just happened?
2. What is happening now?
3. What is next?

The current implementation in `pi/agent/extensions/task-list/render.ts` flattens tasks into one ordered list (`recent completed → in_progress → pending → older completed → failed`) and truncates from the front. That keeps the widget compact, but it mixes fundamentally different kinds of information and can bury failures behind queued work.

The proposed design keeps the existing compact budget of 7 total lines (1 header + 6 content rows), but uses those 6 content rows as a structured window over three sections:

- `terminal`
- `in progress`
- `pending`

Each section shows a small number of representative rows plus an inline per-section hidden count such as `terminal (+2 more):`. This preserves density while making overflow behavior legible.

## Goals

- Preserve the widget's compact footprint.
- Make overflow behavior predictable at a glance.
- Keep terminal outcomes visible without overwhelming active work.
- Use wording consistent with task states already shown elsewhere (`in progress`, `pending`, `failed`).
- Surface hidden-count information per section instead of only globally.

## Non-goals

- Add interactive expansion or scrolling inside the widget.
- Change task state semantics.
- Change the header summary format.
- Change the task-list agent tool schemas.

## Proposed layout

The widget keeps its current header line:

```text
20 tasks (6 done, 5 in progress, 5 pending, 4 failed)
```

When the task list does not overflow, rendering may remain effectively unchanged: show the header and then as many task rows as fit.

When the list overflows, switch to a sectioned layout using exactly 6 content rows beneath the header. The visible sections are:

- `terminal`: completed and failed tasks
- `in progress`: tasks with status `in_progress`
- `pending`: tasks with status `pending`

Section labels are rendered inline on the first visible row of that section to avoid spending extra lines on section headers.

Example:

```text
20 tasks (6 done, 5 in progress, 5 pending, 4 failed)
terminal (+2 more):    ✗ task 14 — failure reason wraps badly in narrow mode
                       ✔ task 11 — strikethrough styling verified
in progress (+3 more): ◼ task 04 — compare narrow and wide layout wrapping
                       ◼ task 05 — watch sticky widget updates
pending (+3 more):     ◻ task 06 — confirm pending rows remain dimmed
                       ◻ task 09 — check footer spacing near viewport edge
```

## Section membership and ordering

### Terminal section

The `terminal` section includes all tasks whose status is `completed` or `failed`.

They are ordered by the following buckets:

1. recent failed
2. recent completed
3. older failed
4. older completed

`recent` uses the existing recent-completion window concept. This design should generalize that same time window to terminal items so recent failures are treated as fresh events too.

Within each bucket:

- preserve stable task-list order unless there is a strong reason to change it
- if timestamp-driven ordering is already available and considered reliable, newest-first is acceptable, but stability is preferred for predictability

### In-progress section

Includes all tasks with status `in_progress`.

Ordering:

- preserve current task-list order

### Pending section

Includes all tasks with status `pending`.

Ordering:

- preserve current task-list order

## Row allocation algorithm

The widget continues to cap itself at 7 total lines:

- 1 header line
- 6 content rows

The 6 content rows are allocated across sections with a quota-and-borrow model.

### Default target quotas

If all sections are non-empty, target:

- `terminal`: 2 rows
- `in progress`: 2 rows
- `pending`: 2 rows

### Pass 1: minimum visibility

Give 1 row to every non-empty section.

This guarantees that every represented state category appears at least once when present.

### Pass 2: fill toward target quotas

Use remaining rows to bring each non-empty section toward its default target:

1. terminal up to 2
2. in progress up to 2
3. pending up to 2

Equivalent outcome: when all three sections are populated, the steady-state layout is usually 2 / 2 / 2.

### Pass 3: borrow unused capacity

If one section has fewer items than its target, redistribute unused rows in this order:

1. `in progress`
2. `pending`
3. `terminal`

This intentionally biases extra space toward current and upcoming work while still keeping terminal information visible.

### Examples of borrowing

If there are no terminal tasks:

- `in progress` and `pending` may expand beyond 2 rows.

If only `in progress` exists:

- it may consume all 6 content rows.

If terminal exists but `pending` does not:

- `in progress` gets the first borrowed rows, then terminal may expand.

## Per-section hidden counts

Each section shows its hidden count inline on that section's first visible row when some of its tasks are not shown.

Examples:

- `terminal (+2 more):`
- `in progress (+1 more):`
- `pending (+4 more):`

Rules:

- Show `(+N more)` only when `N > 0` for that section.
- Do not show a global `+N more` line in sectioned-overflow mode.
- The count is local to that section only.

## Overflow trigger

Sectioned rendering should activate only when the list would otherwise overflow the current compact budget.

Recommended rule:

- If all rows fit under the current non-sectioned rendering budget, keep the simple row list.
- If rows do not fit, switch to sectioned-overflow mode.

This avoids making small task lists look more complex than necessary.

## Rendering behavior details

- Keep existing glyphs and styling per status.
- Keep failed reason text and in-progress activity text when those rows are selected.
- Apply the section label prefix only to the first visible row in a section.
- Indent subsequent rows in the same section so the task text aligns cleanly beneath the first row.
- If a section has only one visible row, it still carries the label and optional hidden count.

## Edge cases

### No terminal tasks

Example:

```text
12 tasks (2 done, 4 in progress, 6 pending, 0 failed)
in progress (+2 more): ◼ wire header summary into tool output
                       ◼ verify wrapping on long activity text
                       ◼ inspect resize behavior in a narrow terminal
pending (+3 more):     ◻ review keyboard navigation through overflow
                       ◻ inspect footer spacing near viewport edge
                       ◻ confirm dim styling for untouched pending rows
```

### Only terminal tasks

Example:

```text
8 tasks (5 done, 0 in progress, 0 pending, 3 failed)
terminal (+2 more): ✗ task 03 — synthetic dispatch failure
                    ✗ task 05 — timeout during validation run
                    ✔ task 01 — header counts verified
                    ✔ task 02 — tool output updated
                    ✔ task 04 — overflow examples rendered
                    ✔ task 06 — strikethrough styling confirmed
```

### Older terminal items remain eligible

Older completed and failed tasks must not disappear entirely once they leave the recent window. They simply sort later within `terminal`.

## Implementation sketch

Primary file:

- `pi/agent/extensions/task-list/render.ts`

Expected refactor areas:

1. Replace the current flat `truncateWithPriority(...)` overflow selection with section-aware selection.
2. Introduce helpers roughly shaped like:
   - `bucketTerminalTasks(...)`
   - `allocateSectionRows(...)`
   - `renderSectionedOverflowLines(...)`
3. Preserve existing non-overflow row rendering where possible.
4. Update tests in:
   - `pi/agent/extensions/task-list/render.test.ts`

Possible implementation split:

- Keep `renderWidgetLines(...)` as the public entry point.
- Branch internally:
  - non-overflow path → existing simple list
  - overflow path → sectioned layout

## Testing strategy

Add tests covering:

- no-overflow path remains simple and unchanged
- overflow path switches to sectioned layout
- all three sections visible with 2 / 2 / 2 allocation
- minimum one-row visibility for each non-empty section
- borrowing behavior when one or more sections are sparse
- per-section hidden counts appear only when needed
- terminal ordering prefers recent failed, then recent completed, then older failed, then older completed
- older terminal tasks remain eligible when recent terminal tasks are absent or sparse
- failed reason text and in-progress activity text still render correctly in sectioned mode
- styled rendering matches the same layout as plain rendering

## Acceptance Criteria

- **AC-1: Overflow switches to sectioned layout.**
  - Given more tasks than can fit in the compact widget budget
  - When the task-list widget renders
  - Then it shows a header plus sectioned content under `terminal`, `in progress`, and `pending` rather than a single flat truncated list.
  - Verifies via: `pi/agent/extensions/task-list/render.test.ts`

- **AC-2: Every non-empty section gets at least one visible row.**
  - Given terminal, in-progress, and pending tasks are all present during overflow
  - When the widget renders
  - Then each non-empty section appears at least once.
  - Verifies via: unit test asserting one visible row per populated section.

- **AC-3: Section quotas and borrowing behave predictably.**
  - Given an overflowing list with uneven section sizes
  - When the widget renders
  - Then rows are allocated by minimum visibility, then toward 2/2/2 targets, then borrowed in the order `in progress → pending → terminal`.
  - Verifies via: unit tests for balanced and sparse-section scenarios.

- **AC-4: Hidden counts are shown per section, not globally.**
  - Given a section has more tasks than visible rows
  - When the widget renders that section
  - Then the first visible row for that section includes `(+N more)` for that section only, and no global `+N more` line is rendered in sectioned mode.
  - Verifies via: unit tests for section-specific hidden counts.

- **AC-5: Older terminal tasks remain eligible.**
  - Given some completed and failed tasks are outside the recent window
  - When overflow selection occurs
  - Then those older terminal tasks can still appear in the `terminal` section after more recent terminal items.
  - Verifies via: unit test with recent and older terminal items.

- **AC-6: Section labels match the visible vocabulary.**
  - Given the widget is in sectioned-overflow mode
  - When it renders labels
  - Then the labels are exactly `terminal`, `in progress`, and `pending`.
  - Verifies via: snapshot-style or exact-string rendering tests.

- **AC-7: The existing compact budget is preserved.**
  - Given the widget is rendered in overflow mode
  - When the line array is produced
  - Then it does not exceed 7 total lines.
  - Verifies via: rendering tests asserting line count.
