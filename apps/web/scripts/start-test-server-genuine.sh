#!/usr/bin/env bash

# Test server for GENUINE API integration tests
# Does NOT set PLAYWRIGHT_TEST=true, allowing real API calls

# Load .env.production file if it exists (contains all secrets)
if [ -f .env.production ]; then
  set -a
  source .env.production
  set +a
  echo "[Genuine Test Server] Loaded environment from .env.production"
fi

export BRIDGE_ENV=local

# Important: Explicitly UNSET PLAYWRIGHT_TEST
# Playwright runner sets this automatically, but we need to clear it
# to allow genuine E2E tests to make real API calls
unset PLAYWRIGHT_TEST

echo "[Genuine Test Server] Starting on port 9548 (genuine API mode)"
echo "[Genuine Test Server] ⚠️  REAL API CALLS ENABLED - will consume credits/tokens"
echo "[Genuine Test Server] PLAYWRIGHT_TEST unset - real API calls allowed"

exec bun x --bun next dev --turbo -p 9548
