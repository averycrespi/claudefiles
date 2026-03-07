# Saving Knowledge

How to save information to the vault.

## Workflow

1. **Check for duplicates first** — search QMD before creating a new file:
   ```bash
   qmd search "topic keywords" -c steven --files
   ```
   If a related file exists, update it instead of creating a new one.

2. **Create the file** — write a new markdown file in `~/steven-vault/knowledge/`
   with a descriptive kebab-case filename:
   - `auth-service-chose-jwt-over-opaque-tokens.md`
   - `deploy-process-requires-staging-approval.md`
   - `api-rate-limits-set-to-1000-per-minute.md`

3. **Add frontmatter** — use the tagging convention from SKILL.md. Set
   `source: manual` for knowledge captured from conversation.

4. **Write concise content** — capture the substance: what was decided and why,
   what the fact is, what was learned. Not verbatim conversation.

5. **Re-embed** — after writing new files:
   ```bash
   qmd embed
   ```

## What to Save

- Decisions and their rationale
- Facts and constraints discovered during work
- Learnings from debugging or investigation
- Meeting outcomes and action items
- Architectural patterns and conventions

## What Not to Save

- Transient status updates ("I'm working on X")
- Raw conversation transcripts
- Speculative conclusions from a single data point
- Credentials, tokens, or sensitive configuration

## Corrections

When Avery corrects something already stored, find and update the existing
file rather than creating a new one. Use QMD search to locate the file,
read it, and edit in place.
