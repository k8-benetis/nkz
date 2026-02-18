#!/usr/bin/env bash
# Pre-commit safety check: block staging of .env files and obvious secrets.
# Usage: run from repo root (nkz). Add to .githooks/pre-commit or run manually:
#   ./scripts/pre-commit-check.sh
# Refs: CLAUDE.md Security Rules, .antigravity/security-policy.md, LINT_WARNINGS_AND_CLEANUP_PLAN.md Phase D.

set -e
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

STAGED="$(git diff --cached --name-only 2>/dev/null || true)"
if [ -z "$STAGED" ]; then
  exit 0
fi

# Block .env* from being committed
if echo "$STAGED" | grep -qE '\.env'; then
  echo "ERROR: Refusing to commit: .env or .env.* file is staged. Unstage it (e.g. git reset HEAD -- .env)."
  exit 1
fi

# Optional: warn on patterns that often indicate secrets (allow override via env)
if [ "${SKIP_SECRET_GREP:-0}" != "1" ]; then
  for f in $STAGED; do
    [ -f "$f" ] || continue
    if git diff --cached -- "$f" | grep -qE '(password|api[_-]?key|secret)\s*=\s*['\''\"][^'\''\"]+['\''\"]'; then
      echo "WARNING: Possible hardcoded secret in staged file: $f"
      echo "If this is a false positive, run: SKIP_SECRET_GREP=1 ./scripts/pre-commit-check.sh"
      exit 1
    fi
  done
fi

echo "Pre-commit check OK (no .env staged; no obvious secrets in diff)."
exit 0
