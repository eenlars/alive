#!/bin/bash
# =============================================================================
# Build and Deploy Claude Bridge
# =============================================================================
# Usage: ./build-and-serve.sh <staging|production>
#
# This script is called by ship.sh - don't run directly.
# For dev, use deploy-dev.sh (hot-reload mode).
#
# Features:
# - Zero-downtime: new build created before service restart
# - Auto-rollback: if health check fails, previous build restored
# - E2E tests: run against deployed server (skip with SKIP_E2E=1)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load shared libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/lock.sh"

# =============================================================================
# Configuration
# =============================================================================
ENV="${1:-}"
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    log_error "Usage: $0 <staging|production>"
    log_error "For dev, use deploy-dev.sh"
    exit 1
fi

PORT=$(get_port "$ENV")
SERVICE=$(get_service "$ENV")
BUILDS_DIR="$PROJECT_ROOT/.builds/$ENV"
MAX_WAIT=$( [ "$ENV" = "staging" ] && echo 60 || echo 30 )

cd "$PROJECT_ROOT"
timer_start

# =============================================================================
# Lock Verification
# =============================================================================
lock_require_or_exit() {
    if [ ! -f "$LOCK_FILE" ]; then
        log_error "No deployment lock. Run via: make ship, make staging, or make production"
        exit 1
    fi
    local lock_pid=$(cut -d'|' -f1 "$LOCK_FILE" 2>/dev/null)

    # Check if lock holder is us or our ancestor
    local pid=$$
    while [ "$pid" != "1" ] && [ -n "$pid" ]; do
        [ "$pid" = "$lock_pid" ] && return 0
        pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ') || break
    done

    # Check if lock holder is still running
    if ps -p "$lock_pid" > /dev/null 2>&1; then
        log_error "Lock held by PID $lock_pid"
        exit 1
    fi

    log_warn "Removing stale lock"
    rm -f "$LOCK_FILE"
}

lock_require_or_exit

# =============================================================================
# Rollback Support
# =============================================================================
PREVIOUS_BUILD=""
[ -L "$BUILDS_DIR/current" ] && PREVIOUS_BUILD=$(readlink "$BUILDS_DIR/current")

rollback() {
    local reason="$1"
    [ -z "$PREVIOUS_BUILD" ] && { log_error "No previous build to rollback"; return 1; }

    log_warn "Rolling back: $reason"
    ln -sfn "$PREVIOUS_BUILD" "$BUILDS_DIR/current"

    # Use robust restart that handles stuck services
    if ! service_force_restart "$SERVICE" 15; then
        log_error "Rollback failed - service won't start"
        log_error "Check: journalctl -u $SERVICE -n 50"
        return 1
    fi

    if health_check "http://localhost:$PORT/" 10 1; then
        log_success "Rollback complete - now serving: $PREVIOUS_BUILD"
    else
        log_error "Rollback partial - service running but health check failed"
        log_error "Check: journalctl -u $SERVICE"
    fi
}

# =============================================================================
# Phase 1: Validate Environment
# =============================================================================
banner "Deploying: $ENV (port $PORT)"
phase_start "Validating environment"

# Check env file
ENV_FILE="apps/web/.env.$ENV"
if [ -f "$ENV_FILE" ]; then
    # Validate LOCKBOX_MASTER_KEY
    LOCKBOX=$(grep "^LOCKBOX_MASTER_KEY=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || echo "")
    if [ -z "$LOCKBOX" ]; then
        phase_end error "Missing LOCKBOX_MASTER_KEY in $ENV_FILE"
        exit 1
    fi
    if ! [[ "$LOCKBOX" =~ ^[0-9a-fA-F]{64}$ ]]; then
        phase_end error "LOCKBOX_MASTER_KEY must be 64 hex chars"
        exit 1
    fi
    log_step "Env vars OK"
fi

# Check port
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    if ! systemctl is-active --quiet "$SERVICE"; then
        phase_end error "Port $PORT in use by unknown process"
        exit 1
    fi
fi

phase_end ok "Environment validated"

# =============================================================================
# Phase 2: Install Dependencies
# =============================================================================
phase_start "Installing dependencies"

set +e
bun install 2>&1 | grep -E "(error|warn|installed)" || true
BUN_EXIT=${PIPESTATUS[0]}
set -e

[ $BUN_EXIT -ne 0 ] && { phase_end error "bun install failed"; exit 1; }
phase_end ok "Dependencies installed"

# =============================================================================
# Phase 3: Static Analysis
# =============================================================================
phase_start "Running static analysis"

set +e
STATIC_OUT=$(make static-check 2>&1)
STATIC_EXIT=$?
set -e

if [ $STATIC_EXIT -ne 0 ]; then
    phase_end error "Static checks failed"
    echo "$STATIC_OUT" | tail -30
    exit 1
fi
phase_end ok "Static checks passed"

# =============================================================================
# Phase 4: Unit Tests
# =============================================================================
phase_start "Running unit tests"

set +e
TEST_OUT=$(bun run unit 2>&1)
TEST_EXIT=$?
set -e

echo "$TEST_OUT" | grep -E "Test Files|Tests " | tail -2 | while read line; do log_step "$line"; done

if [ $TEST_EXIT -ne 0 ]; then
    phase_end error "Tests failed"
    echo "$TEST_OUT" | grep -E "FAIL|error:|Error:" | head -20
    exit 1
fi
phase_end ok "Tests passed"

# =============================================================================
# Phase 5: Build
# =============================================================================
phase_start "Building application"

[ -n "$PREVIOUS_BUILD" ] && log_step "Current: $PREVIOUS_BUILD"

# Remove circular symlinks from bun
rm -f packages/*/template packages/*/images packages/*/tools 2>/dev/null || true

BUILD_LOG="/tmp/claude-bridge-build-${ENV}.log"
set +e
"$SCRIPT_DIR/build-atomic.sh" "$ENV" 2>&1 | tee "$BUILD_LOG"
BUILD_EXIT=${PIPESTATUS[0]}
set -e

if [ $BUILD_EXIT -ne 0 ]; then
    phase_end error "Build failed"
    log_error "Full build log: $BUILD_LOG"
    echo ""
    grep -E "Error:|error TS|error:|failed" "$BUILD_LOG" | head -30
    exit 1
fi

NEW_BUILD=$(readlink "$BUILDS_DIR/current")
log_step "New: $NEW_BUILD"
phase_end ok "Build complete"

# =============================================================================
# Phase 6: Sync Skills
# =============================================================================
phase_start "Syncing skills"

SKILLS_SRC="$PROJECT_ROOT/.claude/skills"
SKILLS_DST="/etc/claude-code/skills"

if [ -d "$SKILLS_SRC" ]; then
    mkdir -p "$SKILLS_DST"
    rsync -a --delete "$SKILLS_SRC/" "$SKILLS_DST/" 2>/dev/null || cp -r "$SKILLS_SRC"/* "$SKILLS_DST/"
    log_step "$(find "$SKILLS_DST" -maxdepth 1 -type d | wc -l) skills synced"
fi
phase_end ok "Skills synced"

# =============================================================================
# Phase 7: Deploy & Health Check
# =============================================================================
phase_start "Deploying"

log_step "Restarting $SERVICE..."
# Use service_force_restart which handles stuck services (deactivating, stop-sigkill, etc.)
# This is more robust than plain `systemctl restart` which can hang on stuck services
SERVICE_WAIT=20
if ! service_force_restart "$SERVICE" "$SERVICE_WAIT"; then
    phase_end error "Failed to restart (service not active after ${SERVICE_WAIT}s)"
    log_error "Service status:"
    systemctl status "$SERVICE" --no-pager 2>&1 | head -20 || true
    rollback "service failed to start"
    exit 1
fi

log_step "Waiting for health check (max ${MAX_WAIT}s)..."
if ! health_check "http://localhost:$PORT/" "$MAX_WAIT" 1; then
    phase_end error "Health check failed"
    rollback "health check timeout"
    exit 1
fi

sleep 3  # Warmup
phase_end ok "Server healthy"

# =============================================================================
# Phase 8: E2E Tests (optional)
# =============================================================================
if [ "${SKIP_E2E:-0}" = "1" ]; then
    log_step "Skipping E2E tests"
else
    phase_start "Running E2E tests"

    E2E_SECRET=$(grep "^E2E_TEST_SECRET=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || echo "")
    if [ -z "$E2E_SECRET" ]; then
        phase_end error "E2E_TEST_SECRET not found in $ENV_FILE"
        exit 1
    fi

    set +e
    (cd apps/web && ENV_FILE=".env.$ENV" E2E_TEST_SECRET="$E2E_SECRET" bun run test:e2e)
    E2E_EXIT=$?
    set -e

    if [ $E2E_EXIT -ne 0 ]; then
        phase_end error "E2E tests failed"
        rollback "E2E failure"
        exit 1
    fi
    phase_end ok "E2E tests passed"
fi

# =============================================================================
# Cleanup & Summary
# =============================================================================
cleanup_old_builds "$BUILDS_DIR" 5

[ "$ENV" != "production" ] && systemctl reload caddy 2>/dev/null || true

banner_success "✓ Deployed: $ENV"
echo -e "  Port:  ${CYAN}$PORT${NC}"
echo -e "  Build: ${CYAN}$NEW_BUILD${NC}"
echo -e "  Time:  ${BOLD}$(format_duration $(timer_elapsed))${NC}"
echo ""
echo "  Logs: journalctl -u $SERVICE -f"
echo ""
