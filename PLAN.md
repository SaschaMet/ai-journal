# AI Journaling App — Plan

## Overview

A local-only **full-stack Bun app** for journaling with AI-powered reflection.

- **Server:** Bun `v1.3.14` with `Bun.serve`
- **Frontend bundling:** Bun HTML/fullstack bundling
- **Database:** SQLite via `bun:sqlite`
- **UI:** React + TypeScript

Users write freely or with AI-generated guidance prompts. After submission, the Bun server stores the entry in SQLite, calls a **user-run local OpenAI-compatible model server** on `localhost`, streams analysis progress back to the frontend, validates the final JSON with Zod, and persists the completed analysis in SQLite.

No accounts. No cloud services. No remote app backend. No IndexedDB primary store. SQLite is the single source of truth.

---

## Product Rules

- **Privacy model:** local SQLite + local model endpoint only.
- **Runtime model:** local full-stack Bun process.
- **Frontend delivery:** Bun HTML imports + Bun fullstack routes. No Vite.
- **Storage:** SQLite only. No dual-write with IndexedDB.
- **React-first UI:** React components + hooks only. No external state manager.
- **Light dependencies:** prefer Bun built-ins and plain CSS.
- **Fail-safe default:** journaling still works if AI analysis is unavailable.
- **Strict AI contract:** support only a narrow, explicit OpenAI-compatible server contract.

---

## Stack

| Concern | Choice |
|---|---|
| Full-stack runtime | Bun `v1.3.14` |
| HTTP server | `Bun.serve` |
| Frontend bundling | Bun HTML/fullstack bundling |
| UI | React + TypeScript |
| Styling | Plain CSS + CSS variables |
| Database | SQLite via `bun:sqlite` |
| Schema validation | Zod |
| IDs | `crypto.randomUUID()` |
| Dates | date-fns |
| AI transport | server-side `fetch` + SSE stream parsing |
| AI endpoint | User-provided local OpenAI-compatible server |
| Tests | Bun test runner |

### Default dependencies

- `react`
- `react-dom`
- `typescript`
- `zod`
- `date-fns`

### Toolchain notes

- Use **Bun** for package installation, runtime, bundling, scripts, tests, and audits.
- Use **Bun HTML imports** to serve frontend entrypoints from server routes.
- Keep a committed text `bun.lock` file.
- Prefer Bun's **isolated linker**.
- Use `trustedDependencies` only if a package requires lifecycle scripts.
- Do not add an ORM in v1. Use raw SQLite queries with prepared statements.

### Removed from prior plans

- `vite`
- `@vitejs/plugin-react`
- `dexie`
- `nanoid`
- `next`
- `ai`
- `@ai-sdk/openai`
- `openai`
- `shadcn/ui`

---

## Architecture

### Server

The Bun server owns:

- HTML routes
- JSON API routes
- SQLite access
- local model API calls
- analysis streaming endpoint
- app configuration persistence

### Frontend

The React frontend is a browser client served by Bun through imported HTML entrypoints. It does not talk directly to the local model endpoint. It talks only to the local Bun server.

### Persistence

SQLite file on local disk.

- Single source of truth
- no IndexedDB sync
- no browser-only persistence layer in v1

### Recommended SQLite setup

- file-backed DB, e.g. `./data/journal.sqlite`
- `PRAGMA journal_mode = WAL;`
- `PRAGMA foreign_keys = ON;`
- prepared statements for repeated queries

---

## Local Model Compatibility Contract

The Bun server supports only providers that implement all of the following:

1. `POST /v1/chat/completions`
2. Local loopback deployment, e.g. `http://127.0.0.1:<port>` or `http://localhost:<port>`
3. `stream: true` with SSE-compatible chunked responses
4. JSON structured output support via `response_format`

### Why server-side now

Because the app is full-stack, the Bun server calls the model directly.
This removes browser CORS dependence between frontend and model server.

### Non-goals

- No support for arbitrary “OpenAI-like” APIs
- No support for cloud endpoints in the default privacy model
- No support for weak plain-text parsing in v1

### Stored config

Persist config in SQLite, not browser local storage:

```ts
{
  baseUrl: string;   // localhost only by default
  model: string;
  apiKey?: string;
}
```

If `baseUrl` is not localhost/127.0.0.1, the app should warn that the setup no longer matches the local-only privacy promise.

---

## Project Structure

```text
/package.json                   # Bun scripts + trustedDependencies
/bunfig.toml                    # Bun install defaults
/bun.lock                       # Committed text lockfile
/tsconfig.json

/src
  server.ts                     # Bun.serve entrypoint
  db.ts                         # SQLite connection, pragmas, migrations bootstrap
  schema.ts                     # Zod schemas + TS types
  prompts.ts                    # Prompt templates
  ai.ts                         # Local model client + SSE parsing
  settings.ts                   # Settings repository
  repositories.ts               # Entry/analysis/settings SQL helpers
  api.ts                        # Route handlers if split from server.ts
  styles.css                    # Global styles

  /frontend
    index.html                  # Bun HTML entrypoint
    main.tsx                    # React entrypoint
    App.tsx                     # App shell + route switch

    /pages
      DashboardPage.tsx
      NewEntryPage.tsx
      EntryDetailPage.tsx
      SettingsPage.tsx

    /components
      EntryEditor.tsx
      AnalysisPanel.tsx
      SummaryCard.tsx
      ReflectionCard.tsx
      PatternsCard.tsx
      FollowUpPrompts.tsx
      EntryList.tsx
      SettingsForm.tsx
      ErrorBanner.tsx

    /lib
      router.ts                 # Tiny History API router
      api-client.ts             # fetch wrappers to local Bun API
      dates.ts                  # UI date/streak helpers

  /test
    db.test.ts
    schema.test.ts
    api.test.ts
    ai.test.ts

/data
  journal.sqlite               # Local SQLite file
```

### Expected Bun configuration

`package.json` scripts:

```json
{
  "scripts": {
    "dev": "bun --hot src/server.ts",
    "build": "bun build --target=bun --production --outdir=dist ./src/server.ts",
    "start": "bun run dist/server.js",
    "typecheck": "bun --bun tsc --noEmit",
    "test": "bun test",
    "audit": "bun audit"
  }
}
```

`bunfig.toml` defaults:

```toml
[install]
linker = "isolated"
saveTextLockfile = true

[test]
preload = []
```

---

## Database Model

### `entries`

```sql
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  content TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('free', 'guided')),
  seeded_prompt TEXT,
  guiding_prompts_json TEXT,
  analysis_status TEXT NOT NULL CHECK (analysis_status IN ('idle', 'running', 'done', 'error')),
  analysis_error TEXT,
  analysis_json TEXT
);
```

### `settings`

Single-row settings table.

```sql
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT
);
```

### Type shapes

`JournalEntry`

```ts
{
  id: string;
  createdAt: string;            // ISO timestamp
  content: string;
  mode: 'free' | 'guided';
  guidingPrompts?: string[];
  seededPrompt?: string;
  analysisStatus: 'idle' | 'running' | 'done' | 'error';
  analysisError?: string;
  analysis?: EntryAnalysis;
}
```

`EntryAnalysis`

```ts
{
  summary: string;
  reflections: {
    emotions: string[];
    themes: string[];
    values?: string[];
    cognitivePatterns?: string[];
    reframes?: string[];
  };
  patterns: {
    pattern: string;
    description: string;
  }[];
  followUpPrompts: string[];
}
```

### Design rules

- `emotions` and `themes` are always required.
- optional reflection fields remain optional.
- final analysis JSON is validated with Zod before persistence.
- partial streamed output is never persisted as final analysis.

---

## API Routes

## HTML routes

- `GET /` → dashboard HTML entrypoint
- `GET /entry/new` → same frontend app HTML
- `GET /entry/:id` → same frontend app HTML
- `GET /settings` → same frontend app HTML

Bun serves the same React app shell through imported HTML.
Client-side routing handles page rendering.

## JSON API routes

### `GET /api/health`

Returns process + DB status.

### `GET /api/settings`

Returns saved local model configuration.

### `PUT /api/settings`

Updates local model configuration.

Request:

```ts
{
  baseUrl: string;
  model: string;
  apiKey?: string;
}
```

### `POST /api/settings/test`

Tests connectivity to the configured local model endpoint.

### `GET /api/entries`

Returns reverse-chronological entries for dashboard.

### `POST /api/entries`

Creates a new journal entry.

Request:

```ts
{
  content: string;
  mode: 'free' | 'guided';
  guidingPrompts?: string[];
  seededPrompt?: string;
}
```

Response:

```ts
{
  id: string;
}
```

### `GET /api/entries/:id`

Returns one entry with parsed analysis if present.

### `POST /api/prompts`

Generates 3–5 guiding prompts.

Request:

```ts
{
  recentEntries?: string[];
}
```

Response:

```ts
{
  prompts: string[];
}
```

### `POST /api/entries/:id/analyze`

Starts analysis for an entry and streams progress/events.

Request:

```ts
{
  retry?: boolean;
}
```

Response:
- SSE stream from Bun server to browser
- final event contains validated `EntryAnalysis`

### Suggested SSE event types

- `status`
- `progress`
- `complete`
- `error`

---

## AI Flow

## Generate guiding prompts

Server loads last 3 entries from SQLite or accepts provided recent entries, calls local model endpoint, validates response, returns prompt list.

Expected result:

```ts
{
  prompts: string[];
}
```

## Analyze entry

Server-side flow:

1. load entry from SQLite
2. load last 10 entries from SQLite
3. set `analysis_status = 'running'`
4. call local model server with `stream: true`
5. parse SSE chunks
6. emit lightweight progress SSE to client
7. assemble final JSON
8. validate with Zod
9. persist `analysis_json`
10. set `analysis_status = 'done'`

On failure:

1. set `analysis_status = 'error'`
2. save short error message
3. emit `error` SSE event

### Request shape to local model

```ts
{
  model: string;
  messages: [...];
  response_format: { type: 'json_schema', json_schema: ... };
  stream: true;
}
```

### Streaming rule

Use streaming for transport and progress visibility only.
Persist only final validated JSON.

---

## Prompting Rules

The analysis prompt must instruct the model to:

- produce `summary`, `reflections.emotions`, `reflections.themes`, `patterns`, `followUpPrompts`
- include `values`, `cognitivePatterns`, `reframes` only when justified by the entry
- identify recurring emotional, behavioral, or thematic loops from recent entries
- keep follow-up prompts open-ended and non-leading
- avoid diagnosis, crisis advice, or claims of certainty
- describe patterns cautiously: `may`, `seems`, `appears` when confidence is limited

---

## UI Flow

## Dashboard (`/`)

- reverse-chronological entry list
- date
- truncated preview
- emotion tags if analysis exists
- analysis state if pending/error
- writing streak counter
- new entry CTA

## Entry Composition (`/entry/new`)

1. render mode toggle: **Free write** | **Guided**
2. if Guided:
   - frontend calls `POST /api/prompts`
   - prompts render above textarea
3. if opened from a follow-up prompt:
   - show prompt as a guidance hint
   - do not pre-fill journal body
4. submit:
   - frontend calls `POST /api/entries`
   - navigate to `/entry/:id`

## Analysis (`/entry/:id`)

1. frontend loads entry via `GET /api/entries/:id`
2. if `analysisStatus === 'done'`, render saved analysis
3. if missing, frontend opens SSE request to `POST /api/entries/:id/analyze`
4. while streaming:
   - show progress and connectivity state
5. on complete:
   - render returned analysis
6. on error:
   - show retry UI

## Settings (`/settings`)

- endpoint URL
- model name
- optional API key
- test connection button
- privacy note
- localhost-only warning

---

## Implementation Defaults

Fixed for v1:

- **Storage:** SQLite only
- **DB access:** `bun:sqlite`, not ORM
- **Bundling:** Bun HTML/fullstack bundling, not Vite
- **Routing:** tiny client router on the frontend; Bun routes on the server
- **Styling:** plain CSS, not Tailwind by default
- **Adaptive depth indicator:** hidden
- **Pattern window:** last 10 entries
- **Follow-up prompt seeding:** hint only, not body prefill
- **Offline / model failure:** journaling still works; AI features degrade with clear errors

---

## Implementation Phases

### Phase 1 — Foundation
1. scaffold Bun project
2. add minimal dependencies with `bun add`
3. add `bunfig.toml`, Bun scripts, committed `bun.lock`
4. create `src/server.ts`
5. create HTML entrypoint + React root
6. add app shell and global styles

### Phase 2 — SQLite Persistence
7. bootstrap SQLite connection
8. enable WAL and foreign keys
9. create schema bootstrap/migration logic
10. implement entry/settings repositories
11. add shared TS + Zod schemas

### Phase 3 — Bun Server Routes
12. add HTML routes through imported `index.html`
13. add health/settings/entries JSON APIs
14. add error handling and JSON validation boundaries

### Phase 4 — Local Model Integration
15. add prompt templates
16. implement local model client on server
17. implement `/api/prompts`
18. implement `/api/entries/:id/analyze` SSE flow
19. persist final validated analysis

### Phase 5 — Frontend Pages
20. build dashboard page
21. build entry composer
22. build entry detail page
23. build settings page
24. build API client wrappers

### Phase 6 — Analysis UX
25. build analysis cards
26. build progress/error/retry states
27. wire follow-up prompt flow

### Phase 7 — Hardening
28. add focused Bun tests for db/schema/api/ai helpers
29. add endpoint misconfiguration and privacy warnings
30. add responsive layout and final cleanup
31. run `bun audit`

---

## Verification Checklist

- [ ] `bun install --linker isolated` completes and writes `bun.lock`
- [ ] `bun run dev` starts the Bun full-stack server without errors
- [ ] HTML entrypoint is served by Bun and React loads correctly
- [ ] `bun run typecheck` passes
- [ ] `bun test` passes
- [ ] `bun audit` shows no unaccepted critical issues
- [ ] SQLite file is created locally
- [ ] WAL mode is enabled successfully
- [ ] user can create and read entries through Bun API routes
- [ ] guided prompts load through server-side local model calls
- [ ] analysis stream reaches the browser as SSE
- [ ] invalid or partial JSON is rejected and not persisted
- [ ] analysis retry works after failure
- [ ] dashboard ordering and streak count are correct
- [ ] follow-up prompt opens new-entry flow as guidance hint
- [ ] non-local model endpoint config shows a privacy warning

---

## Scope Boundaries

**In scope**
- local Bun full-stack server
- SQLite storage
- free write
- guided write
- local model prompt generation
- local model entry analysis
- summary, adaptive reflections, pattern detection, follow-up prompts
- dashboard list and streak counter
- settings page for local endpoint configuration

**Out of scope**
- accounts
- cloud sync
- remote AI providers in default mode
- rich text / Markdown editor
- mobile app
- collaborative features
- entry editing after submission
- search UI
- tags/categories
- embeddings / semantic retrieval
- crisis intervention workflows
- IndexedDB sync/offline cache layer

---

## Risks and Constraints

- SQLite is local-file only; backup/export is still a product concern.
- Structured streaming support varies across local model providers.
- Optional API keys are stored locally in SQLite; acceptable only for local endpoints.
- WAL mode introduces sidecar files (`-wal`, `-shm`).
- Bun HTML/fullstack bundling is the chosen path; avoid mixing Vite into v1.
- Some packages may require Bun `trustedDependencies` for lifecycle scripts.

---

## Open Questions

1. Should v1 include export/import of SQLite journal data, or leave backup/restore for later?
2. Should analysis auto-start immediately after entry creation, or only when the detail page is opened?
3. Should CI be Bun-only (`setup-bun`, `bun ci`, `bun test`, `bun run typecheck`), or keep a Node compatibility lane?