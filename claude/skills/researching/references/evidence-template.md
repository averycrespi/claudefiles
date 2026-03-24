# Evidence Template

Use this structure when creating evidence files in `evidence/`.

```markdown
# {Finding Title} — {YYYY-MM-DD}

## What was tested

Brief description of the experiment or observation that produced this finding.

## Raw data

Reference to the raw output file(s) in `experiments/results/`:

- `experiments/results/{filename}`

## Observations

What the data shows — facts, not interpretation. Include key numbers, query results,
or measurements. Pull specific data points from the raw output rather than summarizing
in vague terms.

## Analysis

What the observations mean in context of the research. This is where interpretation
belongs — why the results look the way they do, what they imply for the next step,
whether they confirm or refute the hypothesis being tested.
```

## Naming Convention

Name evidence files by what was discovered, not by experiment sequence:

- Good: `cache-invalidation-timing-2026-03-23.md`
- Good: `throughput-comparison-2026-03-16.md`
- Good: `config-has-no-effect.md` (date optional if finding is timeless)
- Bad: `experiment-3-results.md`
- Bad: `tuesday-findings.md`

## Granularity

One evidence file per discovery, not per experiment:

- If one experiment reveals two unrelated findings, write two evidence files
- If three experiments all contribute to understanding one phenomenon, write one evidence file that references all three
