#!/bin/bash
set -e

# Source common functions
source "$(dirname "$0")/lib/common.sh"

# Validate required environment variables
require_var SITE_DOMAIN SITE_SLUG SERVICE_NAME

# Optional variables with defaults
REMOVE_USER=${REMOVE_USER:-false}
REMOVE_FILES=${REMOVE_FILES:-false}
REMOVE_PORT=${REMOVE_PORT:-true}

log_info "Tearing down site: $SITE_DOMAIN"

# =============================================================================
# Stop systemd service
# =============================================================================

if service_exists "$SERVICE_NAME"; then
    log_info "Stopping service: $SERVICE_NAME"
    systemctl stop "$SERVICE_NAME" || log_warn "Failed to stop service"

    log_info "Disabling service: $SERVICE_NAME"
    systemctl disable "$SERVICE_NAME" || log_warn "Failed to disable service"

    systemctl daemon-reload
    log_success "Service stopped and disabled"
else
    log_info "Service does not exist, skipping: $SERVICE_NAME"
fi

# =============================================================================
# Remove from Caddy configuration
# =============================================================================

# Get bridge root from env or use default
STREAM_ROOT="${STREAM_ROOT:-/root/alive}"
SERVER_CONFIG="/var/lib/claude-bridge/server-config.json"

if [[ -f "$SERVER_CONFIG" ]]; then
    # =========================================================================
    # Generator mode: Regenerate Caddyfile from database
    # =========================================================================
    # The domain should already be deleted from DB before this script runs.
    # Regenerating will produce a Caddyfile without the deleted domain.
    log_info "Using generator mode for Caddy configuration..."

    cd "$STREAM_ROOT"
    if bun run --cwd packages/site-controller routing:generate; then
        log_info "Validating Caddy configuration..."
        if caddy validate --config /etc/caddy/Caddyfile 2>/dev/null; then
            log_info "Reloading Caddy..."
            systemctl reload caddy || log_warn "Failed to reload Caddy"
            log_success "Caddy configuration regenerated"
        else
            log_warn "Caddy configuration validation failed"
        fi
    else
        log_warn "Failed to regenerate Caddy configuration"
    fi

elif [[ -n "${CADDYFILE_PATH:-}" ]] && [[ -f "$CADDYFILE_PATH" ]]; then
    # =========================================================================
    # Legacy mode: Direct Caddyfile editing
    # =========================================================================
    log_info "Using legacy mode for Caddy configuration..."

    # Acquire lock
    CADDY_LOCK_PATH=${CADDY_LOCK_PATH:-/tmp/caddyfile.lock}
    exec 200>"$CADDY_LOCK_PATH"
    flock -w 30 200 || log_warn "Failed to acquire Caddyfile lock"

    # Escape dots in domain for regex matching
    ESCAPED_DOMAIN=$(echo "$SITE_DOMAIN" | sed 's/\./\\./g')

    # Generate preview subdomain
    PREVIEW_LABEL=$(echo "$SITE_DOMAIN" | tr '.' '-')
    PREVIEW_BASE="${PREVIEW_BASE:-preview.terminal.goalive.nl}"
    PREVIEW_DOMAIN="${PREVIEW_LABEL}.${PREVIEW_BASE}"
    ESCAPED_PREVIEW=$(echo "$PREVIEW_DOMAIN" | sed 's/\./\\./g')

    CADDY_CHANGED=false

    # Remove main domain block
    if grep -q "^${SITE_DOMAIN} {" "$CADDYFILE_PATH"; then
        sed -i "/^${ESCAPED_DOMAIN} {/,/^}/d" "$CADDYFILE_PATH"
        log_success "Removed main domain from Caddyfile"
        CADDY_CHANGED=true
    else
        log_info "Main domain not found in Caddyfile"
    fi

    # Remove preview subdomain block
    if grep -q "^${PREVIEW_DOMAIN} {" "$CADDYFILE_PATH"; then
        sed -i "/^${ESCAPED_PREVIEW} {/,/^}/d" "$CADDYFILE_PATH"
        log_success "Removed preview subdomain from Caddyfile"
        CADDY_CHANGED=true
    else
        log_info "Preview subdomain not found in Caddyfile"
    fi

    # Remove any empty lines left behind
    sed -i '/^$/N;/^\n$/d' "$CADDYFILE_PATH"

    # Reload Caddy if changes were made
    if [[ "$CADDY_CHANGED" == "true" ]]; then
        systemctl reload caddy || log_warn "Failed to reload Caddy"
    fi

    flock -u 200
fi

# =============================================================================
# Remove environment file
# =============================================================================

if [[ -n "${ENV_FILE_PATH:-}" ]] && [[ -f "$ENV_FILE_PATH" ]]; then
    log_info "Removing environment file: $ENV_FILE_PATH"
    rm -f "$ENV_FILE_PATH"
fi

# =============================================================================
# Remove port from registry (if requested)
# =============================================================================

if [[ "$REMOVE_PORT" == "true" ]]; then
    if [[ -n "${REGISTRY_PATH:-}" ]] && [[ -f "$REGISTRY_PATH" ]]; then
        log_info "Removing port assignment from registry..."
        TMP_FILE="${REGISTRY_PATH}.tmp.$$"
        jq --arg domain "$SITE_DOMAIN" 'del(.[$domain])' "$REGISTRY_PATH" > "$TMP_FILE"
        mv "$TMP_FILE" "$REGISTRY_PATH"
        log_success "Port assignment removed"
    fi
else
    log_info "Keeping port assignment in registry (REMOVE_PORT=false)"
fi

# =============================================================================
# Remove user if requested
# =============================================================================

if [[ "$REMOVE_USER" == "true" ]]; then
    SITE_USER="site-${SITE_SLUG}"
    if user_exists "$SITE_USER"; then
        log_info "Removing user: $SITE_USER"
        userdel "$SITE_USER" || log_warn "Failed to remove user"
        log_success "User removed"
    fi
fi

# =============================================================================
# Remove files if requested
# =============================================================================

if [[ "$REMOVE_FILES" == "true" ]]; then
    # Get sites root from env or use default
    SITES_ROOT="${SITES_ROOT:-/srv/webalive/sites}"
    TARGET_DIR="${SITES_ROOT}/${SITE_DOMAIN}"

    if [[ -d "$TARGET_DIR" ]]; then
        log_info "Removing files: $TARGET_DIR"
        rm -rf "$TARGET_DIR"
        log_success "Files removed"
    fi

    # Remove symlink
    SYMLINK_PATH="${SITES_ROOT}/$(echo "$SITE_DOMAIN" | tr '.' '-')"
    if [[ -L "$SYMLINK_PATH" ]]; then
        rm -f "$SYMLINK_PATH"
    fi
fi

log_success "Teardown complete: $SITE_DOMAIN"
exit 0
