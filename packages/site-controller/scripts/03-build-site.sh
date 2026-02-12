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

# Patch vite.config.ts to use assigned PORT from environment
# Templates have hardcoded ports for preview hosting — deployed sites must read PORT at runtime
VITE_CONFIG="${TARGET_DIR}/user/vite.config.ts"
if [[ -f "$VITE_CONFIG" ]]; then
    if grep -q "process.env.PORT" "$VITE_CONFIG"; then
        log_info "vite.config.ts already reads PORT from environment"
    else
        log_info "Patching vite.config.ts to use PORT=$SITE_PORT from environment..."
        # Insert PORT const before export default defineConfig
        sed -i '/export default defineConfig/i\const PORT = Number(process.env.PORT) || '"$SITE_PORT"';\n' "$VITE_CONFIG"
        # Replace hardcoded port numbers with PORT variable
        sed -i 's/port: [0-9]\+/port: PORT/g' "$VITE_CONFIG"
        log_success "vite.config.ts patched"
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
