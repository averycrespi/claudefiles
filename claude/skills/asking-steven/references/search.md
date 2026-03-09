# Searching Memory

How to search the vault via QMD CLI.

## Search Modes

All searches scoped to the `steven` collection with `-c steven`.

### Keyword Search (fast, start here)

```bash
qmd search "exact terms" -c steven
```

BM25 full-text search. Good for specific terms, names, ticket keys, exact
phrases. Start with this for simple lookups.

### Semantic Search (conceptual)

```bash
qmd vsearch "natural language question" -c steven
```

Vector similarity search. Good for questions like "what did we decide about
authentication?" where the exact words may not appear in the stored files.

### Hybrid Search (best quality, slowest)

```bash
qmd query "question" -c steven
```

Combines keyword search, vector search, query expansion, and LLM re-ranking.
Use for important queries when keyword and semantic search don't find what's
needed.

## Useful Flags

- `-n <num>` — number of results (default: 5)
- `--files` — output as file list with scores
- `--full` — show full document content
- `--min-score <num>` — minimum relevance threshold

## Workflow

1. Start with `qmd search` for simple lookups
2. If results are poor, try `qmd vsearch` for semantic matching
3. For critical queries, use `qmd query` for best results
4. After getting search results, read the full files for complete context
5. Present findings conversationally — don't dump raw search output

## No Results

If nothing is found:
- Try different keywords or rephrase the query
- Broaden the search (remove specific terms)
- Check if the knowledge was ever saved — it may not be in the vault yet
- Say so honestly rather than guessing
