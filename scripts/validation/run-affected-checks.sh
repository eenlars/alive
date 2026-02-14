#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

BASE_REF="${GITHUB_BASE_REF:-main}"
REMOTE_BASE_REF="origin/$BASE_REF"

if git show-ref --verify --quiet "refs/remotes/$REMOTE_BASE_REF"; then
  FILTER="...[$REMOTE_BASE_REF]"
elif git show-ref --verify --quiet "refs/heads/$BASE_REF"; then
  FILTER="...[$BASE_REF]"
else
  echo "⚠️ Could not resolve base ref '$BASE_REF'. Falling back to full quick checks."
  bun run check:quick
  exit 0
fi

echo "🔍 Running affected checks with filter: $FILTER"

bun run validate:turbo-env
bun run check:workspace-contract
bun x turbo run type-check ci --filter="$FILTER"
