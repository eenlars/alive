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
# - Build promotion: PROMOTE_FROM=staging promotes staging's build artifact
#   to production (skips deps, static checks, and build — all already validated)
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

# PROMOTE_FROM: skip deps/static/build, promote artifact from another environment
# When set, only 4 phases run: validate → promote → skills → deploy
PROMOTE_FROM="${PROMOTE_FROM:-}"
if [ -n "$PROMOTE_FROM" ]; then
    _TOTAL_PHASES=4
fi

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
# Validate Environment
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
# Install Dependencies & Static Analysis (skipped when promoting)
# =============================================================================
if [ -n "$PROMOTE_FROM" ]; then
    log_step "Skipping checks (validated in $PROMOTE_FROM)"
else
    phase_start "Installing dependencies"

    set +e
    bun install 2>&1 | grep -E "(error|warn|installed)" || true
    BUN_EXIT=${PIPESTATUS[0]}
    set -e

    [ $BUN_EXIT -ne 0 ] && { phase_end error "bun install failed"; exit 1; }
    phase_end ok "Dependencies installed"

    # Static analysis includes unit tests via `bun run static-check`
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
fi

# =============================================================================
# Build (or promote from another environment)
# =============================================================================
phase_start "Building application"

[ -n "$PREVIOUS_BUILD" ] && log_step "Current: $PREVIOUS_BUILD"

# Remove circular symlinks from bun
rm -f packages/*/template packages/*/images packages/*/tools 2>/dev/null || true

if [ -n "$PROMOTE_FROM" ]; then
    # Promote build artifact from another environment
    SOURCE_DIR="$PROJECT_ROOT/.builds/$PROMOTE_FROM"
    SOURCE_BUILD=$(readlink "$SOURCE_DIR/current" 2>/dev/null || echo "")

    if [ -z "$SOURCE_BUILD" ] || [ ! -d "$SOURCE_DIR/$SOURCE_BUILD" ]; then
        phase_end error "No build found in $PROMOTE_FROM to promote"
        exit 1
    fi

    log_step "Promoting from $PROMOTE_FROM: $SOURCE_BUILD"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    DEST="$BUILDS_DIR/dist.$TIMESTAMP"
    mkdir -p "$BUILDS_DIR"

    # Hard-link copy: instant, zero extra disk usage.
    # Clean target before fallback to prevent nested-directory bugs.
    if ! cp -al "$SOURCE_DIR/$SOURCE_BUILD" "$DEST" 2>/dev/null; then
        rm -rf "$DEST" 2>/dev/null || true
        cp -a "$SOURCE_DIR/$SOURCE_BUILD" "$DEST"
    fi

    cd "$BUILDS_DIR"
    ln -sfn "dist.$TIMESTAMP" "current.tmp" && mv -T "current.tmp" "current"
    cd "$PROJECT_ROOT"

    NEW_BUILD="dist.$TIMESTAMP"
    log_step "Promoted: $NEW_BUILD"
    phase_end ok "Build promoted"
else
    BUILD_LOG="/tmp/alive-build-${ENV}.log"
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
fi

# =============================================================================
# Sync Skills
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
# Deploy & Health Check
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

# Verify stream endpoint loads without ChunkLoadError (401 = auth required = route works)
STREAM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/claude/stream" 2>/dev/null || echo "000")
if [ "$STREAM_STATUS" = "500" ] || [ "$STREAM_STATUS" = "000" ]; then
    phase_end error "Stream endpoint returned $STREAM_STATUS (likely missing chunks)"
    rollback "critical endpoint broken"
    exit 1
fi
log_step "Stream endpoint OK (HTTP $STREAM_STATUS)"

phase_end ok "Server healthy"

# =============================================================================
# E2E Tests (optional)
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
