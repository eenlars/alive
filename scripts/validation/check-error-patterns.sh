#!/bin/bash
# Check for error handling anti-patterns (ok vs success, etc.)

set -e

echo "🔍 Checking error handling patterns..."

# Run the error pattern checker
cd apps/web
if bun run scripts/check-error-patterns.ts; then
    echo "✓ Error pattern validation passed"
    exit 0
else
    echo "✗ Error pattern validation failed"
    exit 1
fi