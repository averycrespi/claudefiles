# Spec Workflow Design

Spec Workflow separates human intent from execution state. Markdown artifacts are editable by users and agents; `runtime.json` is the compiled state machine input used by execution, verification, and reporting.

## Architecture

- `config.ts` loads settings and environment overrides.
- `artifacts.ts` constrains all spec files to `.specs/<slug>/` and keeps `.specs/` in `.git/info/exclude`.
- `parser.ts` parses manual-edit-friendly markdown sections.
- `compiler.ts` validates requirements, acceptance criteria, task dependencies, validations, documentation impact, and preserves execution history across recompiles.
- `schema.ts` validates compiled runtime shape.
- `index.ts` registers the `/spec-*` command surface and injects the active phase contract.

## Runtime-first execution

The runtime schema includes lowercase phases, task dependencies, owned paths, validation references, commit handles, skipped-commit checkpoints, amendments, known issues, and approval/challenge placeholders. Later phases should mutate it only through narrow semantic actions so artifacts and event logs stay consistent.

## Safety boundaries

Artifact helpers reject invalid slugs, absolute paths, traversal, and unknown filenames. `.specs/` exclusion is local repo metadata, not a tracked repository change.

## Sources

- Pi extension conventions in this repository: `pi/agent/extensions/workflow-modes/` and `pi/agent/extensions/goal/`.
- Durable control-flow rationale: Brian Suh, “Agents need control flow” at https://bsuh.bearblog.dev/agents-need-control-flow/.
- Subagent and workflow guidance: OpenAI Codex subagents documentation at https://developers.openai.com/codex/concepts/subagents.
