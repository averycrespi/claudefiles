# Hash-Anchored Edits

## What are they?

Hash-anchored edits are an alternative to string-match or line-number-based file editing for coding agents. When the agent reads a file, each line is annotated with a short content hash (e.g., `42#VK`). When editing, the model references these hashes instead of reproducing the original text verbatim or specifying line numbers.

The edit tool validates that hashes still match the current file before applying changes, acting as an optimistic concurrency lock that prevents edits against stale state.

## Why they exist

The approach addresses three failure modes in traditional edit tools:

1. **Line-number fragility**: Line numbers shift when preceding lines are added or removed, causing edits to land in the wrong place.
2. **Reproduction burden**: String-match tools require the model to reproduce existing code character-perfectly (whitespace, indentation, etc.), which weaker models struggle with.
3. **Ambiguous matches**: Identical strings appearing multiple times in a file can cause string-match edits to target the wrong location.

Benchmarks from the original author (16 models, 180 tasks) show dramatic improvements for weaker models — e.g., one model went from 6.7% to 68.3% edit success rate.

## Why we're not implementing them

Pi's built-in edit tool uses exact string matching (`oldText`/`newText`), not line numbers, so the line-shift problem doesn't apply to us. The remaining benefits (fewer output tokens, less reproduction burden) are most impactful for weaker models that struggle with verbatim text reproduction.

Our extensions target Claude, which is strong at exact string matching. The available benchmarks show diminishing returns on capable models — no published comparison demonstrates meaningful gains at this tier.

The tradeoffs work against us:

- **Read overhead**: Every line gains ~5 extra characters of hash annotation, increasing context usage across all file reads.
- **Prompt complexity**: The model needs explicit guidance to understand hash conventions, adding system prompt overhead.
- **Duplicate line handling**: Lines with identical content (blank lines, closing braces) produce hash collisions requiring special disambiguation logic.

## References

- [oh-my-pi](https://github.com/can1357/oh-my-pi) — Pi extension implementing hashline-edit
- [The Harness Problem](https://blog.can.ac) — blog post by the original author (can1357)
- [Dirac](https://github.com/dirac-run/dirac) — coding agent that combines hash-anchored edits with AST operations
