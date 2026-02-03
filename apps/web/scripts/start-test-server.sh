#!/usr/bin/env bash

# Load .env.production file if it exists (contains database secrets, etc.)
if [ -f .env.production ]; then
  set -a
  source .env.production
  set +a
  echo "[Test Server] Loaded environment from .env.production"
fi

# CRITICAL: Override JWT_SECRET to match TEST_CONFIG.JWT_SECRET from @webalive/shared
# This ensures JWTs created by fixtures.ts can be verified by the server
# Single source of truth: packages/shared/src/constants.ts -> TEST_CONFIG.JWT_SECRET
# If you change this, update the constant in constants.ts AND .env.test (copied from .env.test.example)
export JWT_SECRET=test-jwt-secret-for-e2e-tests

export BRIDGE_ENV=local
export PLAYWRIGHT_TEST=true
export TEST_MODE=true
export SKIP_SSL_VALIDATION=true
export SKIP_BUILD=true
exec bun x --bun next dev --turbo -p 9547
