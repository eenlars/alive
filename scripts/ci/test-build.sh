#!/bin/bash
set -e

# Quick isolated build test - skips lint, typecheck, tests
# Just tests if the Next.js build works

echo "🧪 Testing isolated build..."
echo ""

# Remove circular symlinks
echo "1. Removing circular symlinks..."
rm -f packages/*/template packages/*/images packages/*/tools packages/*/site-controller packages/*/shared 2>/dev/null || true
echo "✓ Cleaned symlinks"
echo ""

# Build workspace packages first
echo "2. Building workspace dependencies..."
cd packages/images && bun run build && cd ../..
cd packages/tools && bun run build && cd ../..
cd packages/site-controller && bun run build && cd ../..
echo "✓ Workspace packages built"
echo ""

# Try the web build
echo "3. Building web app..."
cd apps/web
bun run build
echo "✓ Build succeeded!"
