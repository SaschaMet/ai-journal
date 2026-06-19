# Threat Model

## Scope

Local-only journaling app. User content, settings, local model endpoint, and SQLite database are in scope.

## Assets

- Journal entry content
- AI reflections and analysis
- Local model settings and optional API key
- SQLite database files under `data/`

## Trust Boundaries

- Browser to Bun API
- Bun API to SQLite
- Bun API to local OpenAI-compatible model endpoint
- Filesystem boundary for `data/` and `.env*`

## Defaults

- Fail closed on invalid request bodies.
- Local model base URL must resolve to loopback hosts only.
- AI failure must not block journaling.
- Partial streamed output must not be persisted as final analysis.
- Local data and env files must not be committed.

## Main Risks

- Accidental commit of personal journal data or API keys.
- Remote model endpoint leaking private journal content.
- Invalid AI JSON persisted as trusted analysis.
- Overbroad type or lint waivers hiding unsafe boundary handling.
- AI-generated changes weakening tests instead of fixing behavior.

## Controls

- Zod boundary validation.
- Prepared SQLite statements.
- Secret scanning.
- Changed-line coverage.
- Critical mutation checks.
- AI-risk diff guard.
- Hardened TypeScript compiler settings.
