#!/bin/sh
# Enable repo git hooks (e.g. strips Co-authored-by from commit messages).
# Run once after clone: ./scripts/setup-hooks.sh
set -e
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
chmod +x .githooks/prepare-commit-msg 2>/dev/null || true
echo "Git hooks enabled (core.hooksPath = .githooks)"
