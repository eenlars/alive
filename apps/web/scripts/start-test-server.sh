#!/usr/bin/env bash
set -euo pipefail

ENV_FILE_PATH="${ENV_FILE:-.env.staging}"

# Load selected env file for local test server mode.
# Playwright already loads env via load-env.ts, but this keeps script usage consistent
# when run directly.
if [ -f "$ENV_FILE_PATH" ]; then
  set -a
  source "$ENV_FILE_PATH"
  set +a
  echo "[Test Server] Loaded environment from $ENV_FILE_PATH"
fi

if [ "${TEST_ENV:-}" = "production" ]; then
  echo "[Test Server] Production E2E is disabled. Use staging."
  exit 1
fi

# CRITICAL: Override JWT_SECRET to match TEST_CONFIG.JWT_SECRET from @webalive/shared
# This ensures JWTs created by fixtures.ts can be verified by the server
# Single source of truth: packages/shared/src/constants.ts -> TEST_CONFIG.JWT_SECRET
# If you change this, update the constant in constants.ts.
export JWT_SECRET=test-jwt-secret-for-e2e-tests

export STREAM_ENV=local
export PLAYWRIGHT_TEST=true
export TEST_MODE=true
export SKIP_SSL_VALIDATION=true

echo "[Test Server] Starting local test server on port 9547"
exec bun x --bun next dev -p 9547
