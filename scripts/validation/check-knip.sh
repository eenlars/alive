#!/bin/bash
# Check for dead code using Knip

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

echo "🔍 Detecting dead code with Knip..."
bun run knip
echo "✓ No dead code detected"
