#!/usr/bin/env bash
#
# Multi-Port Test Server Launcher
#
# Starts multiple Next.js server instances for parallel E2E testing.
# Each Playwright worker gets its own server to eliminate shared-process contention.
#
# Usage:
#   ./scripts/start-multi-port-servers.sh [num_workers]
#
# Environment:
#   TEST_WORKER_PORT_BASE - Base port (default: 9100)
#   E2E_USE_PRODUCTION_BUILD - If set, use `next start` instead of `next dev`
#
# Ports assigned:
#   Worker 0: $TEST_WORKER_PORT_BASE
#   Worker 1: $TEST_WORKER_PORT_BASE + 1
#   ...
#
# This script is called by playwright.multi-port.config.ts

set -euo pipefail

NUM_WORKERS=${1:-4}
PORT_BASE=${TEST_WORKER_PORT_BASE:-9100}
USE_PROD_BUILD=${E2E_USE_PRODUCTION_BUILD:-}
ENV_FILE_PATH="${ENV_FILE:-.env.staging}"

if [ "$ENV_FILE_PATH" = ".env.test" ]; then
  echo "[Multi-Port Servers] ERROR: $ENV_FILE_PATH is disabled for E2E (dead test DB lane)."
  echo "[Multi-Port Servers] Use ENV_FILE=.env.staging"
  exit 1
fi
PIDS=()

echo "[Multi-Port Servers] Starting $NUM_WORKERS server instances"
echo "[Multi-Port Servers] Port range: $PORT_BASE - $((PORT_BASE + NUM_WORKERS - 1))"

# Load environment
if [ -f "$ENV_FILE_PATH" ]; then
  set -a
  source "$ENV_FILE_PATH"
  set +a
  echo "[Multi-Port Servers] Loaded environment from $ENV_FILE_PATH"
fi

if [ "${TEST_ENV:-}" = "production" ]; then
  echo "[Multi-Port Servers] Production E2E is disabled. Use staging."
  exit 1
fi

# Override JWT secret for E2E tests
export JWT_SECRET=test-jwt-secret-for-e2e-tests
export STREAM_ENV=local
export PLAYWRIGHT_TEST=true
export TEST_MODE=true
export SKIP_SSL_VALIDATION=true

# Build once if using production mode
if [ -n "$USE_PROD_BUILD" ]; then
  echo "[Multi-Port Servers] Building for production..."
  bun x --bun next build
fi

# Cleanup function
cleanup() {
  echo "[Multi-Port Servers] Shutting down servers..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  echo "[Multi-Port Servers] All servers stopped"
}

trap cleanup EXIT INT TERM

# Start a server for each worker
for ((i=0; i<NUM_WORKERS; i++)); do
  PORT=$((PORT_BASE + i))

  # Export worker index for tenant isolation
  export E2E_WORKER_INDEX=$i

  if [ -n "$USE_PROD_BUILD" ]; then
    echo "[Multi-Port Servers] Starting production server on port $PORT (worker $i)"
    bun x --bun next start -p "$PORT" &
  else
    echo "[Multi-Port Servers] Starting dev server on port $PORT (worker $i)"
    bun x --bun next dev --turbo -p "$PORT" &
  fi

  PIDS+=($!)
done

echo "[Multi-Port Servers] All servers starting..."
echo "[Multi-Port Servers] PIDs: ${PIDS[*]}"

# Wait for all servers to be ready
for ((i=0; i<NUM_WORKERS; i++)); do
  PORT=$((PORT_BASE + i))
  echo "[Multi-Port Servers] Waiting for server on port $PORT..."

  # Poll until server responds
  for ((j=0; j<60; j++)); do
    if curl -s "http://localhost:$PORT" > /dev/null 2>&1; then
      echo "[Multi-Port Servers] Server on port $PORT is ready"
      break
    fi
    sleep 1
  done
done

echo "[Multi-Port Servers] All servers ready"

# Wait for any server to exit (indicates a problem)
wait -n "${PIDS[@]}" || true
echo "[Multi-Port Servers] A server exited unexpectedly"
exit 1
