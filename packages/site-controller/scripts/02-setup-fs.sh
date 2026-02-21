#!/bin/bash
set -e

# Source common functions
source "$(dirname "$0")/lib/common.sh"

# Validate required environment variables
require_var SITE_USER SITE_DOMAIN TARGET_DIR TEMPLATE_PATH

log_info "Setting up filesystem for: $SITE_DOMAIN"

# Create target directory
log_info "Creating directory: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# SECURITY: Ensure parent sites directory prevents listing by other users
# Mode 711 allows traversal (cd into) but not listing (ls)
# This prevents domain enumeration by site users
SITES_PARENT="$(dirname "$TARGET_DIR")"
if [[ -d "$SITES_PARENT" ]]; then
    chmod 711 "$SITES_PARENT"
fi

# Copy from template
log_info "Copying from template: $TEMPLATE_PATH"
# Copy entire template directory (includes user/, scripts/, and root files)
# Exclude node_modules, .git, .bun cache, and symlinks to prevent issues
# Use --no-owner --no-group to not preserve source ownership (we'll chown after)
rsync -av --no-owner --no-group --exclude='node_modules' --exclude='.bun' --exclude='.git' --exclude='template' "${TEMPLATE_PATH}/" "${TARGET_DIR}/"

# Create site-specific Caddyfile (overwrite template's generic one)
log_info "Creating site-specific Caddyfile..."
cat > "${TARGET_DIR}/Caddyfile" <<EOF
# Auto-generated Caddyfile for ${SITE_DOMAIN}
# Port: __PORT__

${SITE_DOMAIN} {
    import common_headers
    import image_serving
    reverse_proxy localhost:__PORT__ {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
EOF

# Create workspace schema directories (.alive/files for user work files)
log_info "Creating workspace schema directories..."
mkdir -p "${TARGET_DIR}/user/.alive/files"
echo "1" > "${TARGET_DIR}/user/.alive/.schema-version"

# Set ownership
log_info "Setting ownership to: $SITE_USER:$SITE_USER"
chown -R "$SITE_USER:$SITE_USER" "$TARGET_DIR"

# Bootstrap a local git repository so worktrees work out of the box.
USER_DIR="${TARGET_DIR}/user"
if [[ ! -d "$USER_DIR" ]]; then
    die "Expected workspace directory missing: $USER_DIR"
fi

if [[ ! -d "${USER_DIR}/.git" ]]; then
    log_info "Initializing git repository in workspace..."
    if ! sudo -u "$SITE_USER" git -C "$USER_DIR" init --initial-branch=main >/dev/null 2>&1; then
        sudo -u "$SITE_USER" git -C "$USER_DIR" init >/dev/null
        sudo -u "$SITE_USER" git -C "$USER_DIR" symbolic-ref HEAD refs/heads/main >/dev/null 2>&1 || true
    fi
fi

if ! sudo -u "$SITE_USER" git -C "$USER_DIR" rev-parse --verify HEAD >/dev/null 2>&1; then
    log_info "Creating initial git commit..."
    sudo -u "$SITE_USER" git -C "$USER_DIR" add -A
    sudo -u "$SITE_USER" git -C "$USER_DIR" \
        -c user.name="alive" \
        -c user.email="site@${SITE_DOMAIN}" \
        commit --allow-empty --no-gpg-sign -m "Initial workspace snapshot" >/dev/null
fi

# Set permissions
log_info "Setting directory permissions to 750"
chmod 750 "$TARGET_DIR"

# Create symlink if domain has dots (for easier access)
SYMLINK_NAME=$(echo "$SITE_DOMAIN" | tr '.' '-')
SYMLINK_PATH="/srv/webalive/sites/${SYMLINK_NAME}"
if [[ "$SYMLINK_PATH" != "$TARGET_DIR" ]] && [[ ! -e "$SYMLINK_PATH" ]]; then
    log_info "Creating symlink: $SYMLINK_PATH -> $TARGET_DIR"
    ln -s "$TARGET_DIR" "$SYMLINK_PATH"
fi

log_success "Filesystem setup complete: $TARGET_DIR"
exit 0
