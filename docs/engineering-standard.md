# Engineering Coding Standard

- Profile: Hardened
- Runtime: Bun full-stack TypeScript app with React frontend and SQLite backend
- Package manager/environment: Bun only (`packageManager: bun@1.3.14`)
- Data classification: Restricted personal journal data; local-only by default
- Fast local check: `bun run check:fast`
- Full local check: `bun run check:full`
- CI verification: `bun run check:ci`
- Duplicate-code check: `bun run dup:check` with `.jscpd.json`; blocking in full/CI with generated, test, dependency, coverage, report, and build paths ignored.
- Standard executor: `./scripts/run-coding-standard.sh --mode fast|full|ci|pre-commit`
- AI hooks: `.github/hooks/scripts/block-env-read.sh` blocks `.env` AI tool access; `.github/hooks/scripts/lint-on-session-end.sh` runs an informational linter/check at agent session end and always exits successfully.
- Agent adapters: `.claude/settings.json`, `.codex/hooks.toml`, `.github/hooks/github-copilot-hooks.json`, `.pi/extensions/quality-guard.ts`
- Optional git hook: `git config core.hooksPath .githooks`

## Policy

Default workflow: inspect -> gap analysis -> targeted questions -> implement -> verify.

If `graphify-out/graph.json` exists, query it for architecture, dependency, ownership, duplicate-hotspot, and cross-file relationship questions before manual traversal. Treat graph output as evidence, not a substitute for reading edited files.

## Required Gates

Fast checks:
- Biome format check
- Biome lint
- Documentation-comment gate for exported functions, interfaces, and classes
- TypeScript typecheck
- Bun unit tests
- Secret scan
- AI-risk diff guard in warning mode

Full checks:
- Fast checks
- Bun coverage
- Blocking duplicate-code detection
- Critical mutation checks for validation and persistence behavior
- Changed-line coverage guard
- Cleanup guard for generated artifacts and local data

CI checks:
- Full checks in strict mode
- Dependency audit
- Lockfile enforcement

## CARDS Architecture Policy

Apply CARDS when changing architecture:
- Clarity: names, types, and file organization communicate intent.
- Alignment: volatile UI/API/IO code depends toward stable contracts/domain rules, not the reverse.
- Resilience: small product changes stay local; broad changes require a spec first.
- Domain Integrity: invalid states are blocked by Zod schemas, precise TypeScript types, constructors, validation, or SQLite constraints.
- Separation: domain policy, orchestration, IO, presentation, formatting, and persistence stay isolated unless an approved spec changes boundaries.

Do not add layers or cross-layer shortcuts just to satisfy checks.

## Typing Policy

Use the strictest practical types. Avoid `any`, broad casts, dynamic containers, and ignored type errors. Use `unknown` only at true trust boundaries, then narrow immediately with Zod or a type guard. Any unavoidable waiver must be line-local, justified, and narrower than a code-level fix.

## Lint and Documentation Policy

Lint, documentation-comment checks, and typecheck are quality gates. Do not weaken config, add or expand ignore rules, add lint-disable comments, add ignored type errors, or broaden ignore patterns to pass local, staged, or CI checks. If a tool is wrong, request explicit repository-owner approval before adding the smallest line-local documented exception.

Public and non-trivial functions, methods, interfaces, and classes require concise purpose-focused comments in local TypeScript convention. Comments should explain intent or side effects, not restate names.

## Privacy and Security

- No secrets in code, tests, fixtures, docs, logs, or committed env files.
- Existing `.env` and `.env.*` files are off-limits to AI read, search, list, write, edit, and shell-targeting tools. `.env.example` remains available for documentation.
- The model endpoint must stay loopback-only unless a privacy review changes the product rule.
- SQLite journal files are local data and must not be committed.
- Use prepared SQLite statements.
- Validate all request bodies and model responses at boundaries.

## AI-Assisted Development Guardrails

Flag these patterns for review:
- test-only fixes for production defects
- weakened assertions
- hardcoded branches matching visible examples
- snapshot churn without behavioral justification
- over-mocking of validation, parsing, permission, retry, persistence, or serialization paths
- new or expanded duplicate production code
- new `any`, `unknown`, `object`, broad casts, ignored type errors, or lint disables
- weakened lint/typecheck config or broad ignore patterns

AI-risk checks run in warning mode locally and strict mode in CI.

## Duplicate-Code Policy

`bun run dup:check` runs jscpd against `src` and `scripts`. Duplicate-code detection is blocking in full and CI checks. Exclusions cover generated outputs, dependencies, coverage, reports, fixtures, snapshots, and tests. Prioritize duplicated validation, persistence, parsing, serialization, permissions, calculations, and data mapping.

## Cleanup Policy

After production renames, removals, or large refactors, review and clean stale tests, fixtures, snapshots, mocks, helper files, generated artifacts, and local data files.

## Mutation Policy

`bun run mutation` runs targeted critical mutation checks. Keep mutants focused on validation, privacy boundaries, persistence state, sorting, and contract behavior.

## Architecture References

- Product and architecture plan: `PLAN.md`
- Threat model: `docs/threat-model.md`
