#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

echo "Checking for committed focused tests (.only)..."

# Block accidental focused tests in both Vitest and Playwright suites.
# Keep this intentionally simple and fast.
PATTERN='(\bdescribe\.only\b|\bit\.only\b|\btest\.only\b)'

if grep -Rsn --exclude-dir node_modules --exclude-dir dist --exclude-dir .next -E "$PATTERN" apps packages >/dev/null; then
  echo "Found focused tests:" >&2
  grep -Rsn --exclude-dir node_modules --exclude-dir dist --exclude-dir .next -E "$PATTERN" apps packages | head -n 50 >&2
  fail "Remove .only from tests before pushing."
fi

echo "OK: No focused tests found."

