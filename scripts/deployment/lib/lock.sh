#!/bin/bash
# =============================================================================
# Deployment Lock Library
# =============================================================================
# Provides atomic locking to prevent concurrent deployments.
#
# Usage:
#   source lib/lock.sh
#   lock_acquire "staging"     # Blocks if another deployment running
#   ... do deployment ...
#   lock_release               # Called automatically on EXIT
#
# Lock file format: PID|TIMESTAMP|TARGET|PHASE
# =============================================================================

LOCK_FILE="/tmp/claude-bridge-deploy.lock"

# Colors (if not already defined)
: "${RED:=\033[0;31m}"
: "${YELLOW:=\033[1;33m}"
: "${BOLD:=\033[1m}"
: "${NC:=\033[0m}"

# Current lock state
_LOCK_ACQUIRED=false

lock_acquire() {
    local target="$1"
    local now
    now=$(date '+%Y-%m-%dT%H:%M:%S')

    if [ -f "$LOCK_FILE" ]; then
        local lock_content lock_pid lock_time lock_target lock_phase
        lock_content=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        lock_pid=$(echo "$lock_content" | cut -d'|' -f1)
        lock_time=$(echo "$lock_content" | cut -d'|' -f2)
        lock_target=$(echo "$lock_content" | cut -d'|' -f3)
        lock_phase=$(echo "$lock_content" | cut -d'|' -f4)

        # Check if process is still running
        if [ -n "$lock_pid" ] && ps -p "$lock_pid" > /dev/null 2>&1; then
            echo ""
            echo -e "${RED}════════════════════════════════════════════════════════════${NC}"
            echo -e "${RED}${BOLD}DEPLOYMENT BLOCKED${NC}"
            echo -e "${RED}════════════════════════════════════════════════════════════${NC}"
            echo ""
            echo -e "  Another deployment is already running:"
            echo ""
            echo -e "    ${BOLD}Target:${NC}   $lock_target"
            echo -e "    ${BOLD}Phase:${NC}    ${lock_phase:-unknown}"
            echo -e "    ${BOLD}Started:${NC}  $lock_time"
            echo -e "    ${BOLD}PID:${NC}      $lock_pid"
            echo -e "    ${BOLD}Now:${NC}      $now"
            echo ""
            echo -e "  To force-stop the running deployment:"
            echo -e "    ${YELLOW}kill $lock_pid && rm -f $LOCK_FILE${NC}"
            echo ""
            return 1
        else
            echo -e "${YELLOW}Removing stale lock (PID $lock_pid no longer running)${NC}"
            # Kill any orphaned deployment processes from the dead parent
            # These are child processes that survived SIGKILL of the parent
            local orphans
            orphans=$(pgrep -f "ship.sh|build-and-serve.sh|build-atomic.sh|turbo.*build|turbo.*type-check|next build" 2>/dev/null | grep -v "^$$\$" || true)
            if [ -n "$orphans" ]; then
                echo -e "${YELLOW}Killing orphaned deployment processes...${NC}"
                echo "$orphans" | xargs -r kill -9 2>/dev/null || true
                sleep 1
            fi
            rm -f "$LOCK_FILE"
        fi
    fi

    # Acquire lock atomically (use noclobber)
    set -o noclobber
    if ! echo "$$|$now|$target|starting" > "$LOCK_FILE" 2>/dev/null; then
        set +o noclobber
        # Race condition - another process got the lock
        echo -e "${RED}Failed to acquire lock (race condition)${NC}"
        return 1
    fi
    set +o noclobber

    _LOCK_ACQUIRED=true
    trap '_lock_cleanup' EXIT INT TERM
    return 0
}

lock_update_phase() {
    local phase="$1"
    if [ "$_LOCK_ACQUIRED" = true ] && [ -f "$LOCK_FILE" ]; then
        local content
        content=$(cat "$LOCK_FILE")
        local pid time target
        pid=$(echo "$content" | cut -d'|' -f1)
        time=$(echo "$content" | cut -d'|' -f2)
        target=$(echo "$content" | cut -d'|' -f3)
        echo "$pid|$time|$target|$phase" > "$LOCK_FILE"
    fi
}

lock_release() {
    if [ "$_LOCK_ACQUIRED" = true ]; then
        rm -f "$LOCK_FILE"
        _LOCK_ACQUIRED=false
    fi
}

_lock_cleanup() {
    lock_release
}

# Check if a deployment is running (for status commands)
lock_status() {
    if [ ! -f "$LOCK_FILE" ]; then
        echo "No deployment running"
        return 1
    fi

    local content pid time target phase
    content=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    pid=$(echo "$content" | cut -d'|' -f1)
    time=$(echo "$content" | cut -d'|' -f2)
    target=$(echo "$content" | cut -d'|' -f3)
    phase=$(echo "$content" | cut -d'|' -f4)

    if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
        echo "Deployment running: $target (phase: $phase, started: $time, PID: $pid)"
        return 0
    else
        echo "Stale lock found (PID $pid not running) - auto-cleaning..."
        # Kill any orphaned deployment processes (exclude self)
        local orphans
        orphans=$(pgrep -f "ship.sh|build-and-serve.sh|build-atomic.sh|turbo.*build|turbo.*type-check|next build" 2>/dev/null | grep -v "^$$\$" || true)
        if [ -n "$orphans" ]; then
            echo "Killing orphaned processes..."
            echo "$orphans" | xargs -r kill -9 2>/dev/null || true
            sleep 1
        fi
        rm -f "$LOCK_FILE"
        echo "Cleaned. No deployment running."
        return 1
    fi
}
