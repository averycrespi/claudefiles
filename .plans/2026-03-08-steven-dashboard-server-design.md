# Steven Dashboard Server Design

## Overview

Node.js + Express + TypeScript server that reads the Steven vault, serves a REST API and SSE stream, and proxies search to QMD. Runs locally, read-only, in-memory index rebuilt on startup with incremental updates via filesystem watching.

**Location:** `claudefiles/steven/dashboard/`
**Architecture:** `.plans/2026-03-08-steven-dashboard-architecture.md`

## Project Structure

```
steven/dashboard/
├── package.json
├── tsconfig.json
├── server/
│   ├── index.ts          # Express app, static serving, startup
│   ├── vault.ts          # Vault parser + in-memory indexes
│   ├── watcher.ts        # Chokidar file watcher + event emitter
│   ├── qmd.ts            # QMD child process wrapper
│   └── routes/
│       ├── runs.ts       # GET /api/runs
│       ├── knowledge.ts  # GET /api/knowledge, /tags, /sources, /projects
│       ├── daily.ts      # GET /api/daily/:date, GET /api/daily
│       ├── search.ts     # GET /api/search
│       └── events.ts     # GET /api/events (SSE)
└── client/               # React app (separate design)
```

## Vault Parser (`vault.ts`)

Reads the vault once on startup and builds three in-memory indexes. Exposes a `refresh(path)` method for incremental updates.

### Knowledge Index

Parses all files in `knowledge/` with `gray-matter`. Older obsidian imports may lack `date` and `tags` fields — these are treated as optional.

```ts
interface KnowledgeFile {
  filename: string
  frontmatter: {
    source?: string       // jira, confluence, manual, obsidian, gmail, calendar
    type?: string         // decision, meeting, ticket, page, learning, note, event
    project?: string
    tags?: string[]
    date?: string
  }
  content: string         // raw markdown body
  title: string           // first H1, or humanized filename if no H1
}
```

Secondary indexes recomputed on any change:
- `tagIndex`: `Map<string, KnowledgeFile[]>` — tag name → files
- `sourceIndex`: `Map<string, KnowledgeFile[]>` — source → files
- `projectIndex`: `Map<string, KnowledgeFile[]>` — project → files

### Daily Index

Parses `daily/*.md` files. Date derived from filename, not frontmatter.

```ts
interface DailyNote {
  date: string            // YYYY-MM-DD from filename
  items: DailyItem[]
}

interface DailyItem {
  text: string            // full line text (without checkbox syntax)
  checked: boolean        // [x] = true, [ ] = false
  prefix?: string         // TODO, Context, Idea, Action item, etc.
}
```

Prefix extraction: match bold or plain text before the first colon (e.g., `**ACTION ITEM:** ...` → `ACTION ITEM`, `Context: ...` → `Context`).

### Run Log Index

Parses `logs/**/*.log` files. Semi-structured text format, not markdown.

```ts
interface RunLog {
  job: string             // directory name under logs/
  timestamp: string       // from filename: YYYY-MM-DD_HH-MM-SS
  startTime: string       // from "Time:" line
  endTime?: string        // from "Finished:" line (missing on early failures)
  prompt: string          // from "Prompt:" line
  output: string          // content between --- delimiters
  exitCode?: number       // from "Exit code:" line (missing on early failures)
  success: boolean        // exitCode === 0; false if exitCode missing
}
```

Parser logic:
1. First line: `Time: <startTime>`
2. Second line: `Prompt: <prompt>`
3. Third line: `---` delimiter
4. Everything until next `---` or EOF: output
5. If `Exit code:` line exists: parse number
6. If `Finished:` line exists: parse endTime

Failed runs may lack the closing `---`, `Exit code:`, and `Finished:` lines. Parser handles this gracefully — missing fields are undefined, `success` defaults to false.

### Refresh

`refresh(path: string)` determines which index the path belongs to based on directory prefix:
- `knowledge/` → re-parse single file, rebuild secondary indexes
- `daily/` → re-parse single daily note
- `logs/` → re-parse single log file

On file deletion (`unlink`), removes the entry from the relevant index.

Full rescan only on startup. Incremental updates for all runtime changes.

## File Watcher (`watcher.ts`)

Chokidar watches `~/steven-vault/` with three path patterns:

| Pattern | Event type |
|---|---|
| `knowledge/**/*.md` | `knowledge-update` |
| `daily/**/*.md` | `daily-update` |
| `logs/**/*.log` | `logs-update` |

Ignores `system/` directory — changes there don't affect the dashboard.

On `add`, `change`, or `unlink`:
1. Debounce 200ms (batches rapid writes, e.g., Steven writing a file then running `qmd embed`)
2. Call `vault.refresh(path)`
3. Emit typed event to SSE manager with the updated/deleted entity as payload

## SSE Stream (`routes/events.ts`)

Maintains a `Set<Response>` of connected clients.

**`GET /api/events`:**
- Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Sends initial heartbeat comment
- Adds response to client set
- Removes on connection close

**Broadcasting:**
When watcher emits an event, iterates clients and writes:
```
event: <type>
data: <JSON payload>

```

The payload is the updated entity (re-parsed file), so the frontend can patch state without refetching.

Heartbeat every 30s (`:heartbeat\n\n`) to keep connections alive.

## REST API Routes

All routes read from in-memory indexes — no filesystem access at request time.

### Runs (`routes/runs.ts`)

**`GET /api/runs`**
- Returns all run logs sorted by timestamp descending
- Query params: `?job=<name>` filters by job
- Response: `{ runs: RunLog[], jobs: string[] }`
- `jobs` provides the list of job names for the filter UI

### Knowledge (`routes/knowledge.ts`)

**`GET /api/knowledge`**
- Returns all knowledge files with frontmatter metadata, no body content
- Query params: `?source=`, `?type=`, `?project=`, `?tag=` (all optional, AND logic)
- Response: `{ files: KnowledgeFile[] }` (content field omitted)

**`GET /api/knowledge/:filename`**
- Returns single knowledge file with full markdown body
- 404 if not found

**`GET /api/knowledge/tags`**
- Response: `{ tags: Array<{ name: string, count: number }> }`
- Sorted by count descending

**`GET /api/knowledge/sources`**
- Response: `{ sources: Array<{ name: string, count: number }> }`

**`GET /api/knowledge/projects`**
- Response: `{ projects: Array<{ name: string, count: number }> }`

### Daily (`routes/daily.ts`)

**`GET /api/daily`**
- Returns list of available dates for the date picker
- Response: `{ dates: string[] }` sorted descending

**`GET /api/daily/:date`**
- Returns parsed daily note for YYYY-MM-DD
- 404 if no note for that date
- Response: `{ date: string, items: DailyItem[] }`

### Search (`routes/search.ts`)

**`GET /api/search?q=...&mode=bm25|vector|hybrid`**
- Default mode: `hybrid`
- Proxies to QMD via `qmd.ts`
- Returns 503 with `{ error: "QMD unavailable" }` if QMD fails
- Response: `{ results: Array<{ file: string, score: number, snippet: string }> }`

### SSE (`routes/events.ts`)

**`GET /api/events`**
- SSE endpoint (described above)

## QMD Proxy (`qmd.ts`)

Thin wrapper around `child_process.execFile`.

Mode mapping:
```
bm25   → qmd search "<query>" -c steven
vector → qmd vsearch "<query>" -c steven
hybrid → qmd query "<query>" -c steven
```

- 10s timeout per search
- On QMD failure (non-zero exit, not on PATH, timeout): returns structured error, does not crash
- Parses QMD stdout into `{ file, score, snippet }` array

## Startup Sequence (`index.ts`)

1. Resolve vault path: env var `STEVEN_VAULT` or default `~/steven-vault`
2. Vault parser full scan — build all three indexes
3. Start chokidar watcher
4. Register Express routes + SSE endpoint
5. Serve `client/dist/` as static files (built React app)
6. Listen on `PORT` env var or default `3000`
7. Log: vault stats (file counts per index), port, vault path

## Error Handling

- **Unparseable file:** Skip it, log a warning, don't crash. Partial data is better than no data.
- **QMD broken:** Search returns 503. All other views work normally.
- **Watcher error:** Log and attempt to restart the watcher.
- **SSE client disconnect:** Remove from set silently.

## Dependencies

```json
{
  "dependencies": {
    "express": "^4",
    "gray-matter": "^4",
    "chokidar": "^3"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/express": "^4",
    "tsx": "^4"
  }
}
```

Run in development with `tsx watch server/index.ts`. Production: compile to JS and run with Node.

## Configuration

| Env var | Default | Description |
|---|---|---|
| `STEVEN_VAULT` | `~/steven-vault` | Path to the vault directory |
| `PORT` | `3000` | Server listen port |
