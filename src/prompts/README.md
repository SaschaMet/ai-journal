# Prompts

System prompts sent to the local model live here as plain Markdown so they are
easy to edit without touching application code.

| File | Used by |
|---|---|
| `guiding-prompts.md` | `POST /api/prompts` — generates 3–5 guiding journaling prompts |
| `entry-analysis.md` | `POST /api/entries/:id/analyze` — analyzes an entry and recent history |

## Editing

Edit the `.md` files directly. The text is loaded via [`index.ts`](./index.ts)
as the system message for each request.

- In development (`bun run dev`), `--hot` reloads automatically after a save.
- For a production build (`bun run build`), the text is inlined at build time,
  so rebuild after changing a prompt.

Keep the JSON-only instruction intact — the server requests strict structured
output and validates the response with Zod, so the model must return JSON.
