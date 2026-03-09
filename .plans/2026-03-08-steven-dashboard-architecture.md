# Steven Dashboard Architecture

## Context

The Steven vault (`~/steven-vault/`) contains ~157 knowledge files with YAML frontmatter (source, type, project, tags, date), 206 daily notes with checkbox items, run logs organized by job name, and system configuration files. Currently, the only way to interact with this data is through the `/asking-steven` CLI skill or by reading files directly. There's no visual overview of what's in the vault or how Steven's automated jobs are performing.

QMD provides semantic/keyword/hybrid search over the vault via CLI. Steven's headless runner (`run.sh`) logs each execution with timestamps, prompts, output, and exit codes.

## Goals & Non-Goals

**Goals:**
- Visual dashboard showing vault contents, run health, and daily workflow
- Live updates when vault files change (no manual refresh)
- Search over knowledge via QMD integration
- Runs locally on macOS, accessed at localhost

**Non-Goals:**
- Remote access or authentication
- Write operations (editing vault content through the dashboard)
- Replacing the CLI workflow — this is a read-only companion view
- Mobile-optimized design

## System Overview

A Node.js server reads the Steven vault directory, parses markdown files and frontmatter, and serves both a REST API and Server-Sent Events (SSE) stream. It watches the vault filesystem for changes using chokidar and pushes updates to connected browsers. Search requests proxy to the QMD CLI. A React frontend renders the dashboard with five main views. The entire system runs locally, started via launchd or manually.

```
┌─────────────────────────────────────┐
│           React Frontend            │
│  ┌──────┬──────┬──────┬──────┬────┐ │
│  │Runs  │Tags  │Today │Search│... │ │
│  └──┬───┴──┬───┴──┬───┴──┬───┴────┘ │
│     │ REST │ REST │ SSE  │ REST     │
└─────┼──────┼──────┼──────┼──────────┘
      │      │      │      │
┌─────┼──────┼──────┼──────┼──────────┐
│     ▼      ▼      ▼      ▼          │
│         Node.js Server              │
│  ┌─────────────┐ ┌───────────────┐  │
│  │ Vault Parser │ │ File Watcher  │  │
│  │ (frontmatter │ │ (chokidar)    │  │
│  │  + markdown) │ │  → SSE push   │  │
│  └──────┬──────┘ └───────┬───────┘  │
│         │                │          │
│  ┌──────┴──────┐ ┌───────┴───────┐  │
│  │  REST API   │ │  QMD Proxy    │  │
│  │  /api/*     │ │  (child proc) │  │
│  └─────────────┘ └───────────────┘  │
└─────────────────────────────────────┘
          │                │
          ▼                ▼
   ~/steven-vault/     qmd CLI
```

## Components

### Vault Parser
**Responsibility:** Reads markdown files from the vault, extracts YAML frontmatter and content. Builds in-memory indexes for knowledge (by tag, source, project, date), daily notes (by date, item status), and run logs (by job, status, timestamp).
**Interface:** Exports parsed data structures consumed by API routes. Exposes a `refresh(path)` method called by the file watcher for incremental updates.
**Dependencies:** `gray-matter` for frontmatter parsing. Direct filesystem access to `~/steven-vault/`.

### File Watcher
**Responsibility:** Watches `~/steven-vault/` for file creates, updates, and deletes. Triggers vault parser refresh and pushes change events to connected SSE clients.
**Interface:** Emits typed change events (knowledge-changed, daily-changed, logs-changed) with the affected file path.
**Dependencies:** `chokidar` for filesystem watching. Vault Parser for refresh calls.

### REST API
**Responsibility:** Serves parsed vault data to the frontend. Stateless request/response endpoints.
**Interface:**
- `GET /api/runs` — Run history with status, grouped by job
- `GET /api/knowledge` — Knowledge files with frontmatter metadata
- `GET /api/knowledge/tags` — Tag index with file counts
- `GET /api/knowledge/sources` — Source breakdown
- `GET /api/knowledge/projects` — Project grouping
- `GET /api/daily/:date` — Daily note for a specific date
- `GET /api/search?q=...&mode=bm25|vector|hybrid` — Proxied QMD search
**Dependencies:** Vault Parser for data. QMD CLI for search.

### SSE Stream
**Responsibility:** Maintains persistent connections with browser clients. Pushes real-time updates when vault files change.
**Interface:** `GET /api/events` — SSE endpoint. Events: `knowledge-update`, `daily-update`, `logs-update`, each carrying the changed entity.
**Dependencies:** File Watcher for change events.

### QMD Proxy
**Responsibility:** Executes QMD CLI commands as child processes and returns results. Translates between HTTP request parameters and QMD CLI flags.
**Interface:** Called by the search API route. Supports `search` (BM25), `vsearch` (vector), and `query` (hybrid) modes, all scoped to the `steven` collection.
**Dependencies:** QMD CLI installed and functional. The `steven` collection must be indexed.

### React Frontend
**Responsibility:** Renders the dashboard UI with five views. Subscribes to SSE for live updates. Manages client-side routing between views.
**Interface:** Single-page app served by the Node.js server.
**Dependencies:** REST API for data. SSE stream for live updates.

#### Dashboard Views

1. **Run History** — Table of logged runs grouped by job name. Each row shows timestamp, job name, exit code (color-coded pass/fail), duration, and expandable prompt/output. Filter by job name and date range.

2. **Knowledge Tags** — Tag cloud or grouped list showing all tags with file counts. Clicking a tag shows the tagged files with their titles, sources, dates, and a content preview.

3. **Today / Daily View** — Today's checklist rendered as interactive-looking (but read-only) checkboxes. Calendar or date picker to view past days. Shows carry-forward lineage (how many days an item has been open).

4. **Knowledge Explorer** — Filterable table/card view of all knowledge files. Filter by source, type, project, date range. Click through to see full content rendered as HTML.

5. **Search** — Search bar with mode selector (keyword, semantic, hybrid). Results show file title, relevance score, source, and content snippet. Clicking opens full content.

## Decisions

**SSE over WebSockets:** The data flow is one-directional (server → browser). SSE is simpler to implement, automatically reconnects, and works through proxies. WebSockets would only be needed if the dashboard could write back to the vault, which is a non-goal.

**In-memory index over database:** With ~370 files total, parsing everything into memory on startup is fast and simple. No need for SQLite or another persistence layer. The vault itself is the source of truth.

**QMD as child process over library integration:** QMD is already installed and configured. Shelling out to `qmd search/vsearch/query` avoids coupling to QMD internals and keeps the dashboard independent of QMD version changes.

**Single server serves both API and static frontend:** For a local-only dashboard, there's no reason to separate the frontend build from the API server. The Node server serves the built React app and the API from the same port.

**React over vanilla JS:** With five views, client-side routing, SSE subscription management, and filter state, a component model pays for itself. Keeps each view self-contained.

## Constraints & Limitations

- **QMD must be functional** — Search depends on QMD being installed with the `steven` collection indexed. If QMD is broken (e.g., needs `npm rebuild`), search won't work but other views should degrade gracefully.
- **Vault format is the contract** — The dashboard depends on the current frontmatter schema and file naming conventions. Changes to the vault format require dashboard updates.
- **Read-only** — No vault mutations through the dashboard. This is intentional to keep the CLI as the single write path.
- **Local filesystem only** — No sync mechanism. The dashboard reads from the local vault directory directly.
- **Single user** — No auth, no multi-tenancy, no concurrent write concerns.
