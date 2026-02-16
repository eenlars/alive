#!/usr/bin/env bash
set -euo pipefail

# Test server for GENUINE API integration tests
# Does NOT set PLAYWRIGHT_TEST=true, allowing real API calls

ENV_FILE_PATH="${ENV_FILE:-.env.staging}"

# Load selected env file (staging by default).
if [ -f "$ENV_FILE_PATH" ]; then
  set -a
  source "$ENV_FILE_PATH"
  set +a
  echo "[Genuine Test Server] Loaded environment from $ENV_FILE_PATH"
fi

if [ "${TEST_ENV:-}" = "production" ]; then
  echo "[Genuine Test Server] Production E2E is disabled. Use staging."
  exit 1
fi

export STREAM_ENV=local

# Important: Explicitly UNSET PLAYWRIGHT_TEST
# Playwright runner sets this automatically, but we need to clear it
# to allow genuine E2E tests to make real API calls
unset PLAYWRIGHT_TEST

echo "[Genuine Test Server] Starting on port 9548 (genuine API mode)"
echo "[Genuine Test Server] ⚠️  REAL API CALLS ENABLED - will consume credits/tokens"
echo "[Genuine Test Server] PLAYWRIGHT_TEST unset - real API calls allowed"

exec bun x --bun next dev -p 9548
