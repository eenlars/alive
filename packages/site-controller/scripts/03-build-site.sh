#!/bin/bash
set -e

# Source common functions
source "$(dirname "$0")/lib/common.sh"

# Validate required environment variables
require_var SITE_USER SITE_DOMAIN SITE_PORT SITE_SLUG TARGET_DIR ENV_FILE_PATH

log_info "Building site: $SITE_DOMAIN"

# Create environment file for systemd service
log_info "Creating environment file: $ENV_FILE_PATH"
mkdir -p "$(dirname "$ENV_FILE_PATH")"
cat > "$ENV_FILE_PATH" <<EOF
DOMAIN=$SITE_DOMAIN
PORT=$SITE_PORT
EOF

# SECURITY: Restrict env file to root and site user only
# This prevents cross-tenant secret leakage (CVE-like: other sites reading secrets)
chmod 640 "$ENV_FILE_PATH"
chown root:"$SITE_USER" "$ENV_FILE_PATH"

# Generate vite.config.ts with domain-specific allowedHosts and correct PORT/proxy.
#
# Two paths:
#   1. Fresh template (has scripts/generate-config.js): generates a complete vite.config.ts
#      from scratch with the correct domain, port, and proxy settings.
#   2. Live-site template (no scripts/ dir): the vite.config.ts was rsync'd from the source
#      site and still contains that site's domain in allowedHosts. We patch it in-place.
#      Without this, Vite blocks requests: "This host is not allowed."
GENERATE_SCRIPT="${TARGET_DIR}/scripts/generate-config.js"
if [[ -f "$GENERATE_SCRIPT" ]]; then
    log_info "Generating vite.config.ts for $SITE_DOMAIN:$SITE_PORT..."
    bun "$GENERATE_SCRIPT" "$SITE_DOMAIN" "$SITE_PORT" "$TARGET_DIR"
    log_success "vite.config.ts generated"
else
    # Fallback: patch the existing vite.config.ts copied from the template site.
    # This happens when deploying from a live site (e.g. saas.alive.best) which
    # doesn't ship scripts/generate-config.js — only the raw user/ directory.
    log_info "No generate-config.js found, patching existing vite.config.ts..."
    VITE_CONFIG="${TARGET_DIR}/user/vite.config.ts"
    if [[ -f "$VITE_CONFIG" ]]; then
        # Patch PORT if not already using process.env.PORT
        if ! grep -q "process.env.PORT" "$VITE_CONFIG"; then
            log_info "Patching PORT to $SITE_PORT..."
            sed -i '/export default defineConfig/i\const PORT = Number(process.env.PORT) || '"$SITE_PORT"';\n' "$VITE_CONFIG"
            sed -E -i 's/port:[[:space:]]*[0-9]+/port: PORT/g' "$VITE_CONFIG"
            log_success "vite.config.ts PORT patched"
        fi
        # Patch allowedHosts: replace the template's domain with the actual domain.
        # Without this, Vite rejects requests with the new domain's Host header.
        if grep -q 'allowedHosts:' "$VITE_CONFIG"; then
            log_info "Patching allowedHosts to ${SITE_DOMAIN}..."
            sed -E -i 's/allowedHosts:[[:space:]]*\[[^]]*\]/allowedHosts: ["'"$SITE_DOMAIN"'"]/g' "$VITE_CONFIG"
            log_success "vite.config.ts allowedHosts patched"
        fi
    fi
fi

# Fix ownership before build
log_info "Ensuring correct ownership..."
chown -R "$SITE_USER:$SITE_USER" "$TARGET_DIR"

# Check for pre-built test cache (speeds up E2E tests significantly)
TEST_CACHE_DIR="/tmp/webalive-test-template-cache"
if [[ "$SKIP_BUILD" == "true" ]] && [[ -d "$TEST_CACHE_DIR/node_modules" ]]; then
    log_info "Using pre-built template cache (test mode)..."
    cp -r "$TEST_CACHE_DIR/node_modules" "$TARGET_DIR/" 2>/dev/null || true
    if [[ -d "$TEST_CACHE_DIR/user/dist" ]]; then
        mkdir -p "$TARGET_DIR/user"
        cp -r "$TEST_CACHE_DIR/user/dist" "$TARGET_DIR/user/" 2>/dev/null || true
    fi
    chown -R "$SITE_USER:$SITE_USER" "$TARGET_DIR"
    log_success "Skipped build (using cache)"
else
    # Determine where package.json is located
    # Original templates have package.json at root with workspaces
    # Deployed sites used as templates have package.json only in user/
    if [[ -f "${TARGET_DIR}/package.json" ]]; then
        BUILD_DIR="$TARGET_DIR"
        log_info "Found package.json at root (workspace template)"
    elif [[ -f "${TARGET_DIR}/user/package.json" ]]; then
        BUILD_DIR="${TARGET_DIR}/user"
        log_info "Found package.json in user/ (deployed site template)"
    else
        log_error "No package.json found in $TARGET_DIR or $TARGET_DIR/user"
        exit 13
    fi

    # Install dependencies
    log_info "Installing dependencies in $BUILD_DIR..."
    cd "$BUILD_DIR"
    if ! sudo -u "$SITE_USER" bun install; then
        log_error "Failed to install dependencies"
        exit 13
    fi

    # Run build if package.json has build script
    if jq -e '.scripts.build' package.json &>/dev/null; then
        log_info "Running build..."
        if ! sudo -u "$SITE_USER" bun run build; then
            log_error "Build failed"
            exit 14
        fi
    else
        log_info "No build script found, skipping build step"
    fi

    # Cache the build for future test runs
    if [[ "$SKIP_BUILD" == "true" ]] && [[ ! -d "$TEST_CACHE_DIR" ]]; then
        log_info "Creating test template cache for future runs..."
        mkdir -p "$TEST_CACHE_DIR/user"
        cp -r "$TARGET_DIR/node_modules" "$TEST_CACHE_DIR/" 2>/dev/null || true
        [[ -d "$TARGET_DIR/user/dist" ]] && cp -r "$TARGET_DIR/user/dist" "$TEST_CACHE_DIR/user/" 2>/dev/null || true
    fi
fi

# Final ownership fix
chown -R "$SITE_USER:$SITE_USER" "$TARGET_DIR"

log_success "Site build complete: $SITE_DOMAIN"
exit 0
