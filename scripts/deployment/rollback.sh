#!/bin/bash
set -euo pipefail

# Interactive rollback to previous build
# Works for production and staging (both use systemd)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }

SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_CONFIG="$PROJECT_ROOT/packages/shared/environments.json"

# Verify jq is available
if ! command -v jq &> /dev/null; then
    log_error "jq is required but not installed"
    exit 1
fi

# Verify configuration file exists
if [[ ! -f "$ENV_CONFIG" ]]; then
    log_error "Configuration file not found: $ENV_CONFIG"
    exit 1
fi

# Read environment configuration
PROD_PORT=$(jq -r '.environments.production.port' "$ENV_CONFIG")
STAGING_PORT=$(jq -r '.environments.staging.port' "$ENV_CONFIG")
PROD_SERVICE=$(jq -r '.environments.production.systemdService' "$ENV_CONFIG")
STAGING_SERVICE=$(jq -r '.environments.staging.systemdService' "$ENV_CONFIG")

echo ""
echo "Select environment to rollback:"
echo "  1) Production (port $PROD_PORT)"
echo "  2) Staging (port $STAGING_PORT)"
read -p "Enter choice (1-2): " env_choice

case $env_choice in
    1)
        ENV="production"
        SERVICE="$PROD_SERVICE"
        PORT="$PROD_PORT"
        ;;
    2)
        ENV="staging"
        SERVICE="$STAGING_SERVICE"
        PORT="$STAGING_PORT"
        ;;
    *)
        log_error "Invalid selection"
        exit 1
        ;;
esac

BUILDS_DIR="$PROJECT_ROOT/.builds/${ENV}"
CURRENT_LINK="$BUILDS_DIR/current"

if [[ ! -d "$BUILDS_DIR" ]]; then
    log_error "Builds directory not found: $BUILDS_DIR"
    exit 1
fi

# Collect builds into array (sorted by modification time, newest first)
# Using find with -maxdepth 1 to avoid descending into subdirs
mapfile -t BUILDS < <(
    find "$BUILDS_DIR" -maxdepth 1 -type d -name 'dist.*' -printf '%T@ %f\n' 2>/dev/null | \
    sort -rn | \
    head -10 | \
    cut -d' ' -f2-
)

if [[ ${#BUILDS[@]} -eq 0 ]]; then
    log_error "No builds found in $BUILDS_DIR"
    exit 1
fi

echo ""
echo -e "${BOLD}Available builds for ${ENV}:${NC}"
echo ""

# Display builds with numbers
for i in "${!BUILDS[@]}"; do
    build="${BUILDS[$i]}"
    num=$((i + 1))

    # Check if this is the current build
    if [[ -L "$CURRENT_LINK" ]] && [[ "$(readlink "$CURRENT_LINK")" == "$build" ]]; then
        echo -e "  ${num}) ${build} ${GREEN}(current)${NC}"
    else
        echo "  ${num}) ${build}"
    fi
done

echo ""
read -p "Select build number to rollback to (or Ctrl+C to cancel): " choice

# Validate choice is a number
if ! [[ "$choice" =~ ^[0-9]+$ ]]; then
    log_error "Invalid selection: not a number"
    exit 1
fi

# Convert to array index (0-based)
index=$((choice - 1))

if [[ $index -lt 0 ]] || [[ $index -ge ${#BUILDS[@]} ]]; then
    log_error "Invalid selection: out of range"
    exit 1
fi

BUILD_TO_ROLLBACK="${BUILDS[$index]}"
BUILD_PATH="$BUILDS_DIR/$BUILD_TO_ROLLBACK"

# Validate build directory exists
if [[ ! -d "$BUILD_PATH" ]]; then
    log_error "Build directory not found: $BUILD_PATH"
    exit 1
fi

# Validate build has required files (server.js)
SERVER_JS="$BUILD_PATH/standalone/apps/web/server.js"
if [[ ! -f "$SERVER_JS" ]]; then
    log_error "Build is invalid - missing server.js: $SERVER_JS"
    log_error "This build may be corrupted or incomplete."
    exit 1
fi

echo ""
log_info "Rolling back to: $BUILD_TO_ROLLBACK"
echo ""

# Show what we're rolling back from
if [[ -L "$CURRENT_LINK" ]]; then
    CURRENT=$(readlink "$CURRENT_LINK")
    echo "  Current:  $CURRENT"
else
    echo "  Current:  (no current symlink)"
fi
echo "  Target:   $BUILD_TO_ROLLBACK"
echo ""

read -p "Continue with rollback? (y/N): " confirm
if [[ "$confirm" != "y" ]] && [[ "$confirm" != "Y" ]]; then
    echo "Cancelled"
    exit 0
fi

# Perform atomic symlink swap
cd "$BUILDS_DIR"
ln -sfn "$BUILD_TO_ROLLBACK" current
log_success "Symlink updated"

# Restart service
log_info "Restarting $SERVICE..."
if ! systemctl restart "$SERVICE"; then
    log_error "Failed to restart service"
    log_error "Check logs: journalctl -u $SERVICE -n 50"
    exit 1
fi

# Wait for service to be ready
log_info "Waiting for service to respond..."
WAITED=0
MAX_WAIT=30
while [[ $WAITED -lt $MAX_WAIT ]]; do
    if curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; then
        break
    fi
    sleep 1
    ((WAITED++))
done

if [[ $WAITED -ge $MAX_WAIT ]]; then
    log_warn "Service did not respond within ${MAX_WAIT}s"
    log_warn "Check logs: journalctl -u $SERVICE -n 50"
else
    log_success "Service responding after ${WAITED}s"
fi

echo ""
log_success "Rollback complete"
echo ""
systemctl status "$SERVICE" --no-pager | head -10
