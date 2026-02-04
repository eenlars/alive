#!/bin/bash
# =============================================================================
# Common Deployment Utilities
# =============================================================================
# Shared functions for all deployment scripts.
#
# Usage: source lib/common.sh
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# Timing state
_DEPLOY_START=0
_PHASE_START=0
_CURRENT_PHASE=0
_TOTAL_PHASES=8

# Initialize deployment timer
timer_start() {
    _DEPLOY_START=$(date +%s)
}

timer_elapsed() {
    echo $(( $(date +%s) - _DEPLOY_START ))
}

format_duration() {
    local secs=$1
    if [ "$secs" -ge 60 ]; then
        echo "$((secs / 60))m $((secs % 60))s"
    else
        echo "${secs}s"
    fi
}

# Logging
log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()    { echo -e "  ${DIM}→${NC} $*"; }

# Phase management
phase_start() {
    local name="$1"
    local total="${2:-$_TOTAL_PHASES}"
    _TOTAL_PHASES=$total
    _CURRENT_PHASE=$((_CURRENT_PHASE + 1))
    _PHASE_START=$(date +%s)

    echo ""
    echo -e "${BOLD}${CYAN}[${_CURRENT_PHASE}/${_TOTAL_PHASES}]${NC} ${BOLD}$name${NC}"
    echo -e "${DIM}⏱️  Total elapsed: $(timer_elapsed)s${NC}"

    # Update lock phase if available
    if declare -f lock_update_phase &>/dev/null; then
        lock_update_phase "$name"
    fi
}

phase_end() {
    local status="$1"  # ok, warn, error
    local message="${2:-Done}"
    local duration=$(( $(date +%s) - _PHASE_START ))

    case "$status" in
        ok|success) echo -e "  ${GREEN}✓${NC} $message ${DIM}(${duration}s)${NC}" ;;
        warn)       echo -e "  ${YELLOW}⚠${NC} $message ${DIM}(${duration}s)${NC}" ;;
        *)          echo -e "  ${RED}✗${NC} $message ${DIM}(${duration}s)${NC}" ;;
    esac
}

# Banner
banner() {
    local title="$1"
    local color="${2:-$BLUE}"
    echo ""
    echo -e "${color}═══════════════════════════════════════════════════════${NC}"
    echo -e "${color}${BOLD}$title${NC}"
    echo -e "${color}═══════════════════════════════════════════════════════${NC}"
}

banner_success() { banner "$1" "$GREEN"; }
banner_error()   { banner "$1" "$RED"; }

# Health check with retry
health_check() {
    local url="$1"
    local max="${2:-30}"
    local delay="${3:-1}"
    local waited=0

    while [ $waited -lt $max ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            return 0
        fi
        sleep "$delay"
        waited=$((waited + delay))
    done
    return 1
}

# Environment helpers
get_port() {
    case "$1" in
        dev)        echo "8997" ;;
        staging)    echo "8998" ;;
        production) echo "9000" ;;
    esac
}

get_service() {
    case "$1" in
        dev)        echo "claude-bridge-dev" ;;
        staging)    echo "claude-bridge-staging" ;;
        production) echo "claude-bridge-production" ;;
    esac
}

# Run command and capture output, showing only on failure
run_quiet() {
    local name="$1"
    shift
    local output
    local exit_code

    set +e
    output=$("$@" 2>&1)
    exit_code=$?
    set -e

    if [ $exit_code -ne 0 ]; then
        log_error "$name failed:"
        echo "$output" | tail -50
        return $exit_code
    fi
    return 0
}

# Force-restart a service, handling stuck states
# Returns 0 if service is active after restart, 1 otherwise
#
# CRITICAL: This function uses an interrupt trap to ensure the service is always
# started, even if the script is killed during the restart window. This prevents
# the service from being left in a stopped state.
service_force_restart() {
    local service="$1"
    local max_wait="${2:-15}"
    local state
    local substate
    local main_pid
    local control_group
    local cgroup_path

    # CRITICAL: Set up trap to ensure service starts even if script is interrupted
    # This prevents the race condition where stop succeeds but start never happens
    local _service_restart_trap_set=0
    _ensure_service_started() {
        if [[ $_service_restart_trap_set -eq 1 ]]; then
            log_warn "Script interrupted - ensuring $service is started..."
            systemctl start "$service" 2>/dev/null || true
        fi
    }
    trap _ensure_service_started EXIT INT TERM
    _service_restart_trap_set=1

    # Check current state
    state=$(systemctl show -p ActiveState --value "$service" 2>/dev/null || echo "unknown")
    substate=$(systemctl show -p SubState --value "$service" 2>/dev/null || echo "unknown")

    # If service is stuck in a transitional state, force-kill it
    if [[ "$state" == "deactivating" ]] || [[ "$substate" == "stop-sigterm" ]] || [[ "$substate" == "stop-sigkill" ]]; then
        log_step "Service stuck in $state/$substate, force-killing..."

        # Get the main PID and kill it directly
        main_pid=$(systemctl show -p MainPID --value "$service" 2>/dev/null || echo "0")
        if [[ "$main_pid" != "0" ]] && [[ -n "$main_pid" ]]; then
            kill -9 "$main_pid" 2>/dev/null || true
        fi

        # Kill any remaining processes in the cgroup (use systemd-reported path)
        control_group=$(systemctl show -p ControlGroup --value "$service" 2>/dev/null || echo "")
        if [[ -n "$control_group" ]]; then
            cgroup_path="/sys/fs/cgroup${control_group}"
            if [[ -f "${cgroup_path}/cgroup.procs" ]]; then
                while read pid; do
                    [[ -n "$pid" ]] && kill -9 "$pid" 2>/dev/null || true
                done < "${cgroup_path}/cgroup.procs"
            fi
        fi

        # Wait briefly for systemd to notice
        sleep 2
    fi

    # Reset any failed state
    systemctl reset-failed "$service" 2>/dev/null || true

    # Use systemctl restart which is atomic (systemd handles stop+start internally)
    # This is safer than separate stop/start which can leave service down if interrupted
    # The --no-block allows us to monitor progress, but systemd ensures atomicity
    if ! systemctl restart --no-block "$service" 2>/dev/null; then
        # If restart fails immediately, try stop+start as fallback
        systemctl stop "$service" 2>/dev/null || true
        sleep 1
        if ! systemctl start --no-block "$service" 2>/dev/null; then
            _service_restart_trap_set=0
            trap - EXIT INT TERM
            return 1
        fi
    fi

    # Wait for service to become active
    local waited=0
    while [[ $waited -lt $max_wait ]]; do
        sleep 1
        waited=$((waited + 1))

        state=$(systemctl show -p ActiveState --value "$service" 2>/dev/null || echo "unknown")
        if [[ "$state" == "active" ]]; then
            # Success - disable trap and return
            _service_restart_trap_set=0
            trap - EXIT INT TERM
            return 0
        fi

        # If it failed, no point waiting
        if [[ "$state" == "failed" ]]; then
            _service_restart_trap_set=0
            trap - EXIT INT TERM
            return 1
        fi
    done

    # Timeout - disable trap
    _service_restart_trap_set=0
    trap - EXIT INT TERM
    return 1
}

# Cleanup old builds, keeping N most recent
cleanup_old_builds() {
    local builds_path="$1"
    local keep="${2:-5}"

    [ ! -d "$builds_path" ] && return 0

    local count=$(ls -1d "$builds_path"/dist.* 2>/dev/null | wc -l)
    [ "$count" -le "$keep" ] && return 0

    local to_delete=$((count - keep))
    log_step "Cleaning $to_delete old build(s)..."

    local current=$(readlink "$builds_path/current" 2>/dev/null || echo "")
    ls -1d "$builds_path"/dist.* 2>/dev/null | sort | head -n "$to_delete" | while read dir; do
        local name=$(basename "$dir")
        [ "$name" = "$current" ] && continue
        rm -rf "$dir"
    done
}
