#!/bin/bash
# Check dependency architecture with dependency-cruiser

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

echo "🔍 Checking dependencies (depcruise)..."
bun run depcruise
echo "✓ Dependency validation passed"
exit 0
