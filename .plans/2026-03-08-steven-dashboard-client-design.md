# Steven Dashboard Client Design

## Overview

React SPA with Tailwind CSS, served by the dashboard server. Five views behind a sidebar nav, live updates via SSE, markdown rendering via react-markdown. Vite for dev/build, React Router for client-side routing.

**Location:** `claudefiles/steven/dashboard/client/`
**Server design:** `.plans/2026-03-08-steven-dashboard-server-design.md`
**Architecture:** `.plans/2026-03-08-steven-dashboard-architecture.md`

## Project Structure

```
client/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── src/
│   ├── main.tsx              # React entry, router setup
│   ├── App.tsx               # Layout shell (sidebar + content area)
│   ├── hooks/
│   │   ├── useApi.ts         # Generic fetch wrapper with loading/error state
│   │   └── useSSE.ts         # SSE subscription hook, auto-reconnect
│   ├── views/
│   │   ├── RunHistory.tsx
│   │   ├── KnowledgeTags.tsx
│   │   ├── DailyView.tsx
│   │   ├── KnowledgeExplorer.tsx
│   │   └── Search.tsx
│   └── components/
│       ├── Sidebar.tsx
│       └── MarkdownContent.tsx
```

## Layout

```
┌──────────┬─────────────────────────────┐
│          │                             │
│  Sidebar │      Content Area           │
│          │      (router outlet)        │
│  ○ Today │                             │
│  ○ Runs  │                             │
│  ○ Tags  │                             │
│  ○ Files │                             │
│  ○ Search│                             │
│          │                             │
└──────────┴─────────────────────────────┘
```

- Fixed-width sidebar (~200px), remaining space for content
- Active view highlighted in sidebar
- Default route: `/` → Today/Daily view (most day-to-day useful)

## Shared Hooks

### `useApi(url, params?)`

Generic fetch wrapper for the REST API.

```ts
interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}
```

- Params serialized to query string
- `refetch()` exposed for SSE-triggered refreshes
- Loading state on initial fetch and refetch

### `useSSE()`

Single SSE connection opened once in `App.tsx`, shared across all views.

```ts
// In App.tsx
const sse = useSSE('/api/events')

// In views — register for relevant events
sse.on('logs-update', () => refetchRuns())
sse.on('daily-update', () => refetchDaily())
sse.on('knowledge-update', () => refetchKnowledge())
```

- Connects to `GET /api/events`
- Auto-reconnects on connection drop (native EventSource behavior)
- On reconnect: triggers full refetch for all registered callbacks (events may have been missed during gap)
- Cleans up listeners on component unmount

## Views

### Today / Daily View (`/`)

**Data:** `GET /api/daily/:date`, `GET /api/daily` (date list)

**Layout:**
- Top: date navigation — prev/next arrows + date display. Defaults to today.
- Main: checklist rendered as read-only checkboxes
  - Each item shows its prefix as a colored label:
    - TODO → blue
    - Context → gray
    - Idea → yellow
    - Action item → red
    - Feedback → purple
    - Note → green
  - Checked items shown with strikethrough styling
- Bottom: open items summary — count of unchecked items grouped by prefix

**SSE:** Listens for `daily-update`, refetches if the currently viewed date changed.

### Run History (`/runs`)

**Data:** `GET /api/runs`, optional `?job=` filter

**Layout:**
- Top: filter bar with job name dropdown (populated from `jobs` array in response). Default: all jobs.
- Main: table with columns:
  - Timestamp
  - Job name
  - Status badge (green for success, red for failure)
  - Duration (computed from start/end time, "—" if end time missing)
  - Truncated prompt preview
- Rows are expandable — clicking shows full prompt and output in a `<pre>` block (CLI output, not markdown)
- Sorted by timestamp descending (newest first)

**SSE:** Listens for `logs-update`. New runs appear at the top.

### Knowledge Tags (`/tags`)

**Data:** `GET /api/knowledge/tags`, `GET /api/knowledge?tag=`, `GET /api/knowledge/:filename`

**Layout:**
- Two-panel: left panel is tag list, right panel is file list for selected tag
- Left: tags sorted by count descending, each showing `tag name (count)`
- Right: files matching selected tag — title, source badge, type badge, date
- Clicking a file opens a slide-over/modal with full content via react-markdown

**SSE:** Listens for `knowledge-update`, refetches tag list and current selection.

### Knowledge Explorer (`/knowledge`)

**Data:** `GET /api/knowledge`, `GET /api/knowledge/sources`, `/projects`, `GET /api/knowledge/:filename`

**Layout:**
- Top: filter bar with dropdowns for source, type, project. AND logic. "Clear filters" button when active.
- Main: card grid of knowledge files
  - Each card: title, source badge, type badge, project tag (if present), date
  - Sorted by date descending
  - No pagination (~157 files, filters narrow it down)
- Clicking a card opens the same detail slide-over/modal as Tags view

**SSE:** Listens for `knowledge-update`, refetches list and filter options.

### Search (`/search`)

**Data:** `GET /api/search?q=...&mode=bm25|vector|hybrid`

**Layout:**
- Top: search bar + mode selector (segmented control: Keyword / Semantic / Hybrid). Hybrid default.
- Search triggers on Enter or submit button — not on keystroke (QMD has latency)
- Results: list of cards — file title, relevance score badge, source, content snippet
- Clicking a result opens the detail slide-over/modal
- Empty state: "Search across your knowledge base"
- Error state (QMD unavailable): message explaining search is offline, other views still work

**SSE:** None — search results are point-in-time.

## Shared Components

### `Sidebar`

Nav links for all five views. Highlights active route. Fixed position, doesn't scroll with content.

### `MarkdownContent`

Wraps `react-markdown` for rendering knowledge file content.

- Tailwind `prose` classes for readable typography
- Handles standard markdown: headers, lists, links, code blocks, bold/italic
- Obsidian `![[image]]` embeds rendered as plain text (images not served by the dashboard)
- Used by: Knowledge Tags detail, Knowledge Explorer detail, Search result detail

## Dependencies

```json
{
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "react-router-dom": "^7",
    "react-markdown": "^9"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4",
    "vite": "^6",
    "tailwindcss": "^4",
    "typescript": "^5",
    "@types/react": "^19",
    "@types/react-dom": "^19"
  }
}
```

## Routes

| Path | View | Default |
|---|---|---|
| `/` | DailyView | Yes |
| `/runs` | RunHistory | |
| `/tags` | KnowledgeTags | |
| `/knowledge` | KnowledgeExplorer | |
| `/search` | Search | |
