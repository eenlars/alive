#!/usr/bin/env bash
set -e

echo "🛑 Stopping dev server for E2E debugging..."
systemctl stop claude-bridge-dev 2>/dev/null || echo "Dev server not running"

echo "🧪 Running E2E tests (using .next-test)..."
bun run test:e2e "$@"

echo "🔄 Restarting dev server..."
systemctl start claude-bridge-dev 2>/dev/null || echo "Could not restart dev server"

echo "✅ Done. Dev server should be back online."
