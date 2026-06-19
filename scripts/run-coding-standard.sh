#!/usr/bin/env bash
set -u

MODE="fast"
DRY_RUN=0
STRICT=0

usage() {
  cat <<'EOF'
Usage: ./scripts/run-coding-standard.sh [--mode fast|full|ci|pre-commit] [--strict] [--dry-run]

Modes:
  fast        Format check, lint, doc comments, typecheck, unit tests, secret scan, AI-risk warnings.
  full        Fast checks plus coverage, duplicate-code detection, critical mutation checks, changed-line coverage, cleanup checks.
  ci          Full checks plus dependency audit. Intended for CI with --strict.
  pre-commit  Fast staged-safe checks.

Examples:
  ./scripts/run-coding-standard.sh --mode fast
  ./scripts/run-coding-standard.sh --mode full
  ./scripts/run-coding-standard.sh --mode ci --strict
  ./scripts/run-coding-standard.sh --mode fast --dry-run

Exit codes:
  0  all required checks passed
  1  one or more checks failed
  2  invalid arguments
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --strict)
      STRICT=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$MODE" in
  fast|full|ci|pre-commit) ;;
  *)
    echo "invalid mode: $MODE" >&2
    usage >&2
    exit 2
    ;;
esac

if [[ "$STRICT" == "1" ]]; then
  export CODING_STANDARD_STRICT=1
fi

if [[ "$DRY_RUN" != "1" ]] && ! command -v bun >/dev/null 2>&1; then
  echo "{\"mode\":\"$MODE\",\"status\":\"failed\",\"reason\":\"bun not found on PATH\"}"
  exit 1
fi

FAILURES=0

run_step() {
  local name="$1"
  shift
  local command=("$@")

  if [[ "$DRY_RUN" == "1" ]]; then
    printf '{"step":"%s","status":"planned","command":"%s"}\n' "$name" "${command[*]}"
    return 0
  fi

  printf '{"step":"%s","status":"running"}\n' "$name"
  if "${command[@]}" >&2; then
    printf '{"step":"%s","status":"passed"}\n' "$name"
  else
    printf '{"step":"%s","status":"failed"}\n' "$name"
    FAILURES=$((FAILURES + 1))
  fi
}

run_fast() {
  run_step "format" bun run format:check
  run_step "lint" bun run lint
  run_step "doc-comments" bun run docs:comments
  run_step "typecheck" bun run typecheck
  run_step "unit-tests" bun test
  run_step "secret-scan" bun run security:secrets
  run_step "ai-risk" bun run guard:ai-risk
}

run_full() {
  run_fast
  run_step "coverage" bun run test:coverage
  run_step "duplicate-code" bun run dup:check
  run_step "critical-mutation" bun run mutation
  run_step "changed-line-coverage" bun run guard:changed-coverage
  run_step "cleanup" bun run guard:cleanup
}

printf '{"mode":"%s","strict":%s,"status":"started"}\n' "$MODE" "$([[ "$STRICT" == "1" ]] && echo true || echo false)"

case "$MODE" in
  fast|pre-commit)
    run_fast
    ;;
  full)
    run_full
    ;;
  ci)
    run_full
    run_step "dependency-audit" bun run audit
    ;;
esac

if [[ "$FAILURES" -gt 0 ]]; then
  printf '{"mode":"%s","status":"failed","failures":%s}\n' "$MODE" "$FAILURES"
  exit 1
fi

printf '{"mode":"%s","status":"passed"}\n' "$MODE"
