# AI Journal

Local-only AI journaling app.

## Overview

AI Journal is a Bun full-stack app with:

- **Bun** server via `Bun.serve`
- **React + TypeScript** frontend
- **SQLite** local persistence via `bun:sqlite`
- **LM Studio** as the local OpenAI-compatible model server

Privacy model:

- journal data stays on your machine
- SQLite is the source of truth
- model calls go only to a loopback local server
- no cloud backend
- no accounts

Current state:

- Bun server is wired
- SQLite migrations/bootstrap are wired
- API contracts and repositories are implemented
- LM Studio prompt generation and entry analysis are wired through the OpenAI-compatible API
- frontend is still a minimal starter shell

## How it works

1. The Bun server starts on `http://localhost:3000` by default.
2. Data is stored in `data/journal.sqlite`.
3. The app talks to **LM Studio** on the default local API endpoint:
   - `http://127.0.0.1:1234/v1`
4. If no model settings are saved yet, the server tries that default LM Studio endpoint and uses the first loaded model.
5. Prompt generation and analysis use LM Studio structured output (`json_schema`) and validate responses with Zod before trusting them.

## Requirements

- **Bun** `1.3.14`
- **LM Studio** running locally
- At least one model loaded in LM Studio

## Start the project

### 1. Install dependencies

```bash
bun install --linker isolated
```

### 2. Start LM Studio

In LM Studio:

- start the local server
- keep it on the default port `1234`
- load a model

Expected base URL:

```text
http://127.0.0.1:1234/v1
```

### 3. Start the app

```bash
bun run dev
```

App URL:

```text
http://localhost:3000
```

## Available scripts

```bash
bun run dev
bun run build
bun run start
bun run typecheck
bun test
bun run check:fast
bun run check:full
bun run check:ci
```

## Useful routes

HTML routes:

- `/`
- `/entry/new`
- `/settings`

API routes:

- `GET /api/health`
- `GET /api/settings`
- `PUT /api/settings`
- `POST /api/settings/test`
- `GET /api/entries`
- `POST /api/entries`
- `GET /api/entries/:id`
- `POST /api/prompts`
- `POST /api/entries/:id/analyze`

## Local model behavior

The app expects LM Studio's OpenAI-compatible API.

Used endpoints:

- `GET /v1/models`
- `POST /v1/chat/completions`

Constraints:

- loopback-only base URL
- structured output required for prompt generation and analysis
- if LM Studio is unavailable, AI routes fail with explicit errors
- journaling storage remains local in SQLite

## Environment

Example local env file:

```bash
cp .env.example .env
```

Current supported env:

- `PORT=3000`

## Project structure

```text
src/
  server.ts            Bun server entry
  api.ts               API route handlers
  api-contract.ts      Zod request/response contracts
  ai.ts                LM Studio integration
  db.ts                SQLite bootstrap
  repositories.ts      SQLite queries
  frontend/            Bun HTML + React entry
  styles.css           Global styles
```

## Verification

Run:

```bash
bun run typecheck
bun test
bun run check:fast
```

## Notes

- `code` opening with no output is normal for some VS Code shell setups.
- `bun --version` should print the installed Bun version.
- The current UI is intentionally minimal; the backend and model integration are the main implemented pieces.
