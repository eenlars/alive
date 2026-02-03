#!/bin/bash
# Common functions for site controller scripts

# Color codes for output
readonly COLOR_RESET='\033[0m'
readonly COLOR_INFO='\033[0;36m'
readonly COLOR_SUCCESS='\033[0;32m'
readonly COLOR_WARN='\033[0;33m'
readonly COLOR_ERROR='\033[0;31m'

# Logging functions (all write to stderr to avoid interfering with script output)
log_info() {
    echo -e "${COLOR_INFO}[INFO]${COLOR_RESET} $*" >&2
}

log_success() {
    echo -e "${COLOR_SUCCESS}[SUCCESS]${COLOR_RESET} $*" >&2
}

log_warn() {
    echo -e "${COLOR_WARN}[WARN]${COLOR_RESET} $*" >&2
}

log_error() {
    echo -e "${COLOR_ERROR}[ERROR]${COLOR_RESET} $*" >&2
}

# Error handling
die() {
    log_error "$*"
    exit 1
}

# Require environment variables
require_var() {
    for var in "$@"; do
        if [[ -z "${!var}" ]]; then
            die "$var is required but not set"
        fi
    done
}

# Path helpers
get_script_dir() {
    cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

get_project_root() {
    git rev-parse --show-toplevel 2>/dev/null || pwd
}

# Check if command exists
command_exists() {
    command -v "$1" &>/dev/null
}

# Check if user exists
user_exists() {
    id -u "$1" &>/dev/null
}

# Check if systemd service exists
service_exists() {
    systemctl list-unit-files | grep -q "^$1"
}

# Check if port is in use
port_in_use() {
    netstat -tuln | grep -q ":$1 "
}

# Wait for condition with timeout
wait_for() {
    local timeout=$1
    local interval=${2:-1}
    shift 2
    local cmd="$*"

    local elapsed=0
    while ! eval "$cmd" &>/dev/null; do
        sleep "$interval"
        elapsed=$((elapsed + interval))
        if [[ $elapsed -ge $timeout ]]; then
            return 1
        fi
    done
    return 0
}

# Atomic file write using temp file
atomic_write() {
    local target_file=$1
    local content=$2
    local tmp_file="${target_file}.tmp.$$"

    echo "$content" > "$tmp_file"
    mv "$tmp_file" "$target_file"
}

# JSON helper - extract value (requires jq)
json_get() {
    local file=$1
    local key=$2
    jq -r "$key" < "$file" 2>/dev/null || echo ""
}

# JSON helper - check if key exists
json_has_key() {
    local file=$1
    local key=$2
    jq -e "$key" < "$file" &>/dev/null
}
