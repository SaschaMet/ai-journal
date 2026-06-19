# Repository Instructions

This repository follows the hardened engineering coding standard in `docs/engineering-standard.md`.

Assistant workflow:
1. Inspect the repository and current toolchain.
2. If `graphify-out/graph.json` exists, query it for architecture/dependency/relationship questions before manual traversal.
3. Summarize gaps against the engineering standard.
4. Ask only targeted clarification questions when the repository cannot answer them.
5. Add or update files, hooks, scripts, docs, and CI.
6. Run verification and summarize results.

Read first:
- `docs/engineering-standard.md`
- `docs/threat-model.md`
- `PLAN.md`
- `.github/hooks/scripts/block-env-read.sh` when present
- `.github/hooks/scripts/lint-on-session-end.sh` when present
- `.pi/extensions/quality-guard.ts` when present

Run standard checks with:
- Fast: `bun run check:fast`
- Full: `bun run check:full`
- CI: `bun run check:ci`

Special rules:
- Keep Bun as the canonical package manager unless explicitly changed.
- Apply CARDS when changing architecture: clarity of intent, dependency alignment toward stable contracts/core rules, small-change resilience, domain integrity through invalid-state prevention, and separation of domain/orchestration/IO/presentation/persistence concerns.
- Use the strictest practical types. Avoid `any`, broad casts, dynamic containers, and ignored type errors.
- Use `unknown` only at true trust boundaries, then narrow immediately with Zod or a type guard.
- Do not weaken lint or typecheck config to pass checks. Do not add or expand lint ignore rules, lint-disable comments, ignored type errors, or broad ignore patterns.
- If a waiver is unavoidable, request explicit repository-owner approval first; keep it line-local and document the concrete reason.
- Public and non-trivial functions, methods, interfaces, and classes require concise purpose-focused documentation comments.
- Keep the `.env` guard and session-end lint hook installed. Agent sessions must run the existing linter/check at session end when one is detectable; if none exists, the hook passes silently.
- Do not read, search, list, or change `.env` or `.env.*` when they exist. Use `.env.example` for documenting required variables.
- Duplicate-code detection is blocking in full and CI checks.
- Keep pre-commit fast; coverage, mutation, duplicate-code checks, and strict AI-risk checks belong in full/CI checks.
- Do not add competing tools when the existing formatter, linter, type checker, test runner, or CI command can be extended.
- Do not add new layers or cross-layer shortcuts without repo evidence or an approved spec.
