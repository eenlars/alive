#!/bin/bash
# Fix Permissions Script
# Called by systemd timer to fix ownership of all site directories
#
# Usage: ./fix-permissions.sh
#
# Logs to journald (view with: journalctl -u fix-permissions.service)
#
# Pattern:
#   /srv/webalive/sites/example.com -> owned by site-example-com:site-example-com
#   Directory permissions: 750

set -euo pipefail

SITES_ROOT="/srv/webalive/sites"

# Color codes
COLOR_RESET='\033[0m'
COLOR_INFO='\033[0;36m'
COLOR_SUCCESS='\033[0;32m'
COLOR_WARN='\033[0;33m'
COLOR_ERROR='\033[0;31m'

log_info() { echo -e "${COLOR_INFO}[INFO]${COLOR_RESET} $*"; }
log_success() { echo -e "${COLOR_SUCCESS}[OK]${COLOR_RESET} $*"; }
log_warn() { echo -e "${COLOR_WARN}[WARN]${COLOR_RESET} $*"; }
log_error() { echo -e "${COLOR_ERROR}[ERROR]${COLOR_RESET} $*"; }

# Convert domain to user name (dots to dashes, prepend site-)
domain_to_user() {
    local domain="$1"
    echo "site-$(echo "$domain" | tr '.' '-')"
}

# Check if user exists
user_exists() {
    id -u "$1" &>/dev/null
}

echo "[fix-permissions] Starting permission fix for all sites..."
echo "[fix-permissions] Sites root: $SITES_ROOT"

fixed_count=0
skipped_count=0
error_count=0

# Iterate over all directories in sites root (skip symlinks)
for site_path in "$SITES_ROOT"/*; do
    # Skip if not a directory or is a symlink
    if [[ ! -d "$site_path" ]] || [[ -L "$site_path" ]]; then
        continue
    fi

    domain=$(basename "$site_path")
    expected_user=$(domain_to_user "$domain")

    # Skip if user doesn't exist (site not properly deployed)
    if ! user_exists "$expected_user"; then
        log_warn "Skipping $domain - user $expected_user does not exist"
        ((skipped_count++)) || true
        continue
    fi

    # Check if any file/dir inside has wrong ownership (user or group)
    # Excludes node_modules/.bun (shared hardlink cache across sites) and node_modules itself
    # These are caches that may have mixed ownership due to bun's hardlinking
    wrong_ownership=$(find "$site_path" \
        -path "*/node_modules/.bun" -prune -o \
        -path "*/node_modules" -prune -o \
        \( ! -user "$expected_user" -o ! -group "$expected_user" \) -print -quit 2>/dev/null || true)

    # Check directory permissions
    current_perms=$(stat -c '%a' "$site_path" 2>/dev/null || echo "000")

    # Fix if any ownership is wrong OR directory perms are wrong
    if [[ -n "$wrong_ownership" ]] || [[ "$current_perms" != "750" ]]; then
        log_info "Fixing $domain (ownership and permissions)"
        if chown -R "$expected_user:$expected_user" "$site_path" 2>/dev/null; then
            chmod 750 "$site_path"
            ((fixed_count++)) || true
        else
            log_error "Failed to fix $domain"
            ((error_count++)) || true
        fi
    fi
done

echo ""
echo "[fix-permissions] Complete!"
echo "[fix-permissions] Fixed: $fixed_count"
echo "[fix-permissions] Skipped: $skipped_count"
echo "[fix-permissions] Errors: $error_count"

if [[ $error_count -gt 0 ]]; then
    exit 1
fi

exit 0
