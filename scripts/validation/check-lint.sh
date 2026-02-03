#!/bin/bash
# Run linter (Biome)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

echo "🔍 Running linter (Biome)..."
bun run lint
echo "✓ Lint checks passed"
exit 0
