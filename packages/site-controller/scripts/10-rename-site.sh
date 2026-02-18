#!/bin/bash
set -e

# Rename a site: user, directory, symlink, systemd, env file
# All OS-level operations in one atomic script.
#
# Required env vars:
#   OLD_DOMAIN, NEW_DOMAIN, OLD_SLUG, NEW_SLUG
#
# Optional:
#   SITES_ROOT (default: /srv/webalive/sites)
#   SYSTEMD_ENV_DIR (default: /etc/sites)

source "$(dirname "$0")/lib/common.sh"

require_var OLD_DOMAIN NEW_DOMAIN OLD_SLUG NEW_SLUG

SITES_ROOT="${SITES_ROOT:-/srv/webalive/sites}"
SYSTEMD_ENV_DIR="${SYSTEMD_ENV_DIR:-/etc/sites}"

OLD_USER="site-${OLD_SLUG}"
NEW_USER="site-${NEW_SLUG}"
OLD_SERVICE="site@${OLD_SLUG}.service"
NEW_SERVICE="site@${NEW_SLUG}.service"
OLD_DIR="${SITES_ROOT}/${OLD_DOMAIN}"
NEW_DIR="${SITES_ROOT}/${NEW_DOMAIN}"
OLD_SYMLINK="${SITES_ROOT}/${OLD_SLUG}"
NEW_SYMLINK="${SITES_ROOT}/${NEW_SLUG}"
OLD_ENV="${SYSTEMD_ENV_DIR}/${OLD_SLUG}.env"
NEW_ENV="${SYSTEMD_ENV_DIR}/${NEW_SLUG}.env"
OLD_OVERRIDE="/etc/systemd/system/site@${OLD_SLUG}.service.d"
NEW_OVERRIDE="/etc/systemd/system/site@${NEW_SLUG}.service.d"

log_info "Renaming site: ${OLD_DOMAIN} → ${NEW_DOMAIN}"

# =============================================================================
# Validate preconditions
# =============================================================================

if [[ ! -d "$OLD_DIR" ]]; then
    die "Source directory does not exist: ${OLD_DIR}"
fi

if [[ -d "$NEW_DIR" ]]; then
    die "Target directory already exists: ${NEW_DIR}"
fi

if user_exists "$NEW_USER"; then
    die "Target user already exists: ${NEW_USER}"
fi

# =============================================================================
# Phase 1: Stop old service
# =============================================================================

log_info "[1/7] Stopping old service: ${OLD_SERVICE}"
if systemctl is-active --quiet "$OLD_SERVICE" 2>/dev/null; then
    systemctl stop "$OLD_SERVICE"
    log_success "Service stopped"
else
    log_info "Service was not running"
fi

# =============================================================================
# Phase 2: Create new user
# =============================================================================

log_info "[2/7] Creating new user: ${NEW_USER}"
useradd --system --shell /usr/sbin/nologin --no-create-home "$NEW_USER"
log_success "User created: $(id "$NEW_USER")"

# =============================================================================
# Phase 3: Rename directory + symlink
# =============================================================================

log_info "[3/7] Renaming directory: ${OLD_DIR} → ${NEW_DIR}"
mv "$OLD_DIR" "$NEW_DIR"

# Remove old symlink, create new one
if [[ -L "$OLD_SYMLINK" ]]; then
    rm -f "$OLD_SYMLINK"
fi
ln -s "$NEW_DIR" "$NEW_SYMLINK"
log_success "Directory renamed, symlink created"

# =============================================================================
# Phase 4: Transfer ownership
# =============================================================================

log_info "[4/7] Transferring ownership to ${NEW_USER}"
chown -R "${NEW_USER}:${NEW_USER}" "$NEW_DIR"
log_success "Ownership transferred"

# =============================================================================
# Phase 5: Rename env file
# =============================================================================

log_info "[5/7] Updating env file"
if [[ -f "$OLD_ENV" ]]; then
    # Update DOMAIN value and move file
    sed "s/^DOMAIN=.*/DOMAIN=${NEW_DOMAIN}/" "$OLD_ENV" > "$NEW_ENV"
    rm -f "$OLD_ENV"
    log_success "Env file: ${NEW_ENV}"
else
    # Create new env file with port from systemd or default
    echo "DOMAIN=${NEW_DOMAIN}" > "$NEW_ENV"
    log_warn "Old env file not found, created new one (port may be missing)"
fi

# =============================================================================
# Phase 6: Migrate systemd override
# =============================================================================

log_info "[6/7] Migrating systemd override"
if [[ -d "$OLD_OVERRIDE" ]]; then
    mkdir -p "$NEW_OVERRIDE"
    cp -a "${OLD_OVERRIDE}/." "${NEW_OVERRIDE}/"
    rm -rf "$OLD_OVERRIDE"
    log_success "Override migrated"
else
    log_info "No override directory to migrate"
fi

# Disable old service, enable new
systemctl disable "$OLD_SERVICE" 2>/dev/null || true
systemctl daemon-reload
systemctl enable "$NEW_SERVICE"

# =============================================================================
# Phase 7: Clean up old user
# =============================================================================

log_info "[7/7] Removing old user: ${OLD_USER}"
userdel "$OLD_USER" 2>/dev/null || log_warn "Failed to remove old user"

systemctl daemon-reload
log_success "Rename complete: ${OLD_DOMAIN} → ${NEW_DOMAIN}"
exit 0
