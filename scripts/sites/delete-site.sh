#!/bin/bash
# Secure Website Deletion Script
# Usage: ./delete-site.sh domain.com [--force]
#
# This script removes a site from WebAlive infrastructure:
# - Stops and disables systemd service
# - Removes site directory (both /srv and legacy /root locations)
# - Removes from Caddy configuration
# - Removes system user
# - Removes environment file
# - Reloads Caddy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_skip()    { echo -e "${CYAN}[SKIP]${NC} $1"; }

usage() {
    echo "Usage: $0 domain.com [--force]"
    echo ""
    echo "Options:"
    echo "  --force    Skip confirmation prompt"
    echo ""
    echo "This will completely remove the site from WebAlive infrastructure:"
    echo "  - Stop and disable systemd service"
    echo "  - Remove site directory"
    echo "  - Remove from Caddy configuration"
    echo "  - Remove system user"
    echo "  - Remove environment file"
    echo "  - Reload Caddy"
    exit 1
}

# Parse arguments
FORCE=false
DOMAIN=""

for arg in "$@"; do
    case $arg in
        --force)
            FORCE=true
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [[ -z "$DOMAIN" ]]; then
                DOMAIN="$arg"
            else
                log_error "Unknown argument: $arg"
                usage
            fi
            ;;
    esac
done

if [[ -z "$DOMAIN" ]]; then
    usage
fi

# Normalize domain
DOMAIN=$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')
SLUG=${DOMAIN//[^a-zA-Z0-9]/-}

# Escape dots for sed regex (example.com -> example\.com)
ESCAPED_DOMAIN=$(echo "$DOMAIN" | sed 's/\./\\./g')

# Paths
SERVICE_NAME="site@${SLUG}.service"
USER="site-${SLUG}"
NEW_SITE_DIR="/srv/webalive/sites/$DOMAIN"
OLD_SITE_DIR="/root/webalive/sites/$DOMAIN"
SYMLINK_PATH="/srv/webalive/sites/$SLUG"
CADDYFILE="$PROJECT_ROOT/ops/caddy/Caddyfile"
ENV_FILE="/etc/sites/${SLUG}.env"

echo ""
echo "=========================================="
echo "  Site Deletion: $DOMAIN"
echo "=========================================="
echo ""
echo "This will remove:"
echo "  Service:    $SERVICE_NAME"
echo "  User:       $USER"
echo "  Directory:  $NEW_SITE_DIR (or $OLD_SITE_DIR)"
echo "  Env file:   $ENV_FILE"
echo "  Caddy:      Remove from $CADDYFILE"
echo ""

# Confirmation
if [[ "$FORCE" != "true" ]]; then
    read -p "Are you sure you want to delete $DOMAIN? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

echo ""
ERRORS=0

# 1. Stop and disable systemd service
log_info "Stopping systemd service: $SERVICE_NAME"
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    if systemctl stop "$SERVICE_NAME"; then
        log_success "Service stopped"
    else
        log_warn "Failed to stop service"
        ((ERRORS++)) || true
    fi
else
    log_skip "Service not running"
fi

if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    if systemctl disable "$SERVICE_NAME" 2>/dev/null; then
        log_success "Service disabled"
    else
        log_warn "Failed to disable service"
        ((ERRORS++)) || true
    fi
else
    log_skip "Service not enabled"
fi

# 2. Remove site directory (check both locations)
SITE_DIR=""
if [[ -d "$NEW_SITE_DIR" ]]; then
    SITE_DIR="$NEW_SITE_DIR"
elif [[ -d "$OLD_SITE_DIR" ]]; then
    SITE_DIR="$OLD_SITE_DIR"
fi

if [[ -n "$SITE_DIR" ]]; then
    log_info "Removing site directory: $SITE_DIR"
    if rm -rf "$SITE_DIR"; then
        log_success "Site directory removed"
    else
        log_warn "Failed to remove site directory"
        ((ERRORS++)) || true
    fi
else
    log_skip "No site directory found"
fi

# 3. Remove symlink if exists
if [[ -L "$SYMLINK_PATH" ]]; then
    log_info "Removing symlink: $SYMLINK_PATH"
    if rm -f "$SYMLINK_PATH"; then
        log_success "Symlink removed"
    else
        log_warn "Failed to remove symlink"
        ((ERRORS++)) || true
    fi
elif [[ -e "$SYMLINK_PATH" ]]; then
    log_warn "$SYMLINK_PATH exists but is not a symlink - skipping"
fi

# 4. Remove from Caddyfile (with proper escaping)
log_info "Removing from Caddyfile..."
if [[ -f "$CADDYFILE" ]] && grep -q "^${DOMAIN} {" "$CADDYFILE"; then
    # Use escaped domain for sed pattern matching
    if sed -i "/^${ESCAPED_DOMAIN} {/,/^}/d" "$CADDYFILE"; then
        # Clean up double empty lines
        sed -i '/^$/N;/^\n$/d' "$CADDYFILE"
        log_success "Removed from Caddyfile"
    else
        log_warn "Failed to update Caddyfile"
        ((ERRORS++)) || true
    fi
else
    log_skip "Domain not found in Caddyfile"
fi

# 5. Remove system user
log_info "Removing system user: $USER"
if id "$USER" &>/dev/null; then
    if userdel "$USER" 2>/dev/null; then
        log_success "User removed"
    else
        log_warn "Failed to remove user (may still own files)"
        ((ERRORS++)) || true
    fi
else
    log_skip "User does not exist"
fi

# 6. Remove environment file
log_info "Removing environment file: $ENV_FILE"
if [[ -f "$ENV_FILE" ]]; then
    if rm -f "$ENV_FILE"; then
        log_success "Environment file removed"
    else
        log_warn "Failed to remove environment file"
        ((ERRORS++)) || true
    fi
else
    log_skip "Environment file does not exist"
fi

# 7. Reload Caddy (with timeout to prevent hanging)
log_info "Reloading Caddy..."
if timeout 10 systemctl reload caddy 2>/dev/null; then
    log_success "Caddy reloaded"
else
    log_warn "Failed to reload Caddy (timed out or error) - trying restart"
    if timeout 15 systemctl restart caddy 2>/dev/null; then
        log_success "Caddy restarted"
    else
        log_warn "Failed to restart Caddy"
        ((ERRORS++)) || true
    fi
fi

# 8. Verification
echo ""
echo "=========================================="
echo "  Verification"
echo "=========================================="
echo ""

verify_removed() {
    local name=$1
    local check=$2
    if eval "$check"; then
        echo -e "  ${RED}[EXISTS]${NC} $name"
        return 1
    else
        echo -e "  ${GREEN}[GONE]${NC}   $name"
        return 0
    fi
}

VERIFY_ERRORS=0
verify_removed "Service running" "systemctl is-active --quiet '$SERVICE_NAME' 2>/dev/null" || ((VERIFY_ERRORS++)) || true
verify_removed "User exists" "id '$USER' &>/dev/null" || ((VERIFY_ERRORS++)) || true
verify_removed "Site directory" "[[ -d '$NEW_SITE_DIR' ]] || [[ -d '$OLD_SITE_DIR' ]]" || ((VERIFY_ERRORS++)) || true
verify_removed "Env file" "[[ -f '$ENV_FILE' ]]" || ((VERIFY_ERRORS++)) || true
verify_removed "In Caddyfile" "grep -q '^${DOMAIN} {' '$CADDYFILE' 2>/dev/null" || ((VERIFY_ERRORS++)) || true

echo ""
echo "=========================================="

if [[ $ERRORS -eq 0 ]] && [[ $VERIFY_ERRORS -eq 0 ]]; then
    echo -e "${GREEN}Site $DOMAIN deleted successfully${NC}"
    exit 0
elif [[ $VERIFY_ERRORS -eq 0 ]]; then
    echo -e "${YELLOW}Site $DOMAIN deleted with $ERRORS warnings${NC}"
    exit 0
else
    echo -e "${RED}Site $DOMAIN deletion incomplete - $VERIFY_ERRORS items remain${NC}"
    exit 1
fi
