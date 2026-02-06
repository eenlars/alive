#!/bin/bash
# =============================================================================
# Atomic Build Script
# =============================================================================
# Builds to .builds/{env}/dist, then atomically swaps symlink.
# Called by build-and-serve.sh - don't run directly.
#
# Usage: ./build-atomic.sh <staging|production>
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load shared libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/standalone-packages.sh"

# =============================================================================
# Configuration
# =============================================================================
ENV="${1:-}"
if [[ ! "$ENV" =~ ^(staging|production)$ ]]; then
    log_error "Usage: $0 <staging|production>"
    log_error "Dev uses hot-reload (next dev) and does not use this script"
    exit 1
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BUILDS_DIR="$PROJECT_ROOT/.builds/$ENV"
TEMP_BUILD_DIR="$BUILDS_DIR/dist"
TIMESTAMPED_DIR="$BUILDS_DIR/dist.$TIMESTAMP"
WEB_DIR="$PROJECT_ROOT/apps/web"
WEB_NEXT_DIR="$WEB_DIR/.next"

cd "$PROJECT_ROOT"

# =============================================================================
# Cleanup on Failure
# =============================================================================
DEV_BACKUP=""

cleanup_failed_build() {
    local exit_code=$?
    [ $exit_code -eq 0 ] && return

    log_error "Build failed with exit code $exit_code"

    # Clean up temp build
    [ -d "$TEMP_BUILD_DIR" ] && rm -rf "${TEMP_BUILD_DIR:?}"

    # Restore dev server files
    if [ -n "$DEV_BACKUP" ] && [ -d "$DEV_BACKUP" ]; then
        mkdir -p "$WEB_NEXT_DIR"
        mv "$DEV_BACKUP" "$WEB_NEXT_DIR/dev" 2>/dev/null || true
        log_step "Dev server files restored"
    fi
}

trap cleanup_failed_build EXIT

# =============================================================================
# Phase 1: Pre-build Checks
# =============================================================================
log_step "Checking disk space..."
REQUIRED_MB=250
AVAILABLE_MB=$(df -BM "$PROJECT_ROOT" | tail -1 | awk '{print $4}' | sed 's/M//')
if [ "$AVAILABLE_MB" -lt "$REQUIRED_MB" ]; then
    log_error "Insufficient disk space: ${AVAILABLE_MB}MB available, ${REQUIRED_MB}MB required"
    exit 1
fi

mkdir -p "$BUILDS_DIR"

# =============================================================================
# Phase 2: Preserve Dev Server
# =============================================================================
if [ -d "$WEB_NEXT_DIR/dev" ]; then
    log_step "Backing up dev server files..."
    DEV_BACKUP="$WEB_NEXT_DIR.dev-backup"
    rm -rf "${DEV_BACKUP:?}" 2>/dev/null || true
    mv "$WEB_NEXT_DIR/dev" "$DEV_BACKUP"
fi

# =============================================================================
# Phase 3: Clean & Validate
# =============================================================================
log_step "Cleaning build artifacts..."
rm -rf "${WEB_NEXT_DIR:?}" "${PROJECT_ROOT:?}/.turbo" "${PROJECT_ROOT:?}/node_modules/.cache/turbo"
rm -rf "${WEB_DIR:?}/dist" 2>/dev/null || true

log_step "Validating workspace..."
if ! "$SCRIPT_DIR/../validation/detect-workspace-issues.sh" >/dev/null 2>&1; then
    log_error "Workspace validation failed"
    exit 1
fi

log_step "Validating standalone packages..."
if ! "$SCRIPT_DIR/validate-standalone.sh" >/dev/null 2>&1; then
    log_error "Standalone package validation failed"
    "$SCRIPT_DIR/validate-standalone.sh"  # Run again to show errors
    exit 1
fi

# Remove circular symlinks from bun
rm -f templates/site-template/site-template 2>/dev/null || true
for pkg in packages/*/; do rm -f "$pkg/$(basename "$pkg")" 2>/dev/null || true; done

# =============================================================================
# Phase 4: Build
# =============================================================================
log_step "Building web app..."
BUILD_START=$(date +%s)

BUILD_OUTPUT_LOG="/tmp/claude-bridge-nextjs-build-${ENV}.log"
if ! bun run build --filter=web --force 2>&1 | tee "$BUILD_OUTPUT_LOG"; then
    log_error "Build failed. Errors:"
    echo ""
    grep -E "error TS|Error:|error:|Type error|Module not found|Cannot find" "$BUILD_OUTPUT_LOG" | head -30
    echo ""
    log_error "Full build output: $BUILD_OUTPUT_LOG"
    exit 1
fi

BUILD_TIME=$(($(date +%s) - BUILD_START))
log_step "Build completed in ${BUILD_TIME}s"

# =============================================================================
# Phase 5: Verify Build Output
# =============================================================================
log_step "Verifying build output..."

[ ! -d "$WEB_NEXT_DIR/standalone" ] && { log_error "Standalone directory not found"; exit 1; }
[ ! -f "$WEB_NEXT_DIR/standalone/apps/web/server.js" ] && { log_error "server.js not found"; exit 1; }

# =============================================================================
# Phase 6: Move to .builds
# =============================================================================
log_step "Moving build to .builds..."
mv "$WEB_NEXT_DIR" "$TEMP_BUILD_DIR"

# Restore dev server
if [ -n "$DEV_BACKUP" ] && [ -d "$DEV_BACKUP" ]; then
    mkdir -p "$WEB_NEXT_DIR"
    mv "$DEV_BACKUP" "$WEB_NEXT_DIR/dev"
fi

# =============================================================================
# Phase 7: Copy Static Assets
# =============================================================================
STANDALONE_DIR="$TEMP_BUILD_DIR/standalone/apps/web"

mkdir -p "$STANDALONE_DIR/.next"
# Use rsync with trailing slashes to MERGE contents (cp -r creates nested dirs if target exists)
[ -d "$TEMP_BUILD_DIR/static" ] && rsync -a "$TEMP_BUILD_DIR/static/" "$STANDALONE_DIR/.next/static/"
[ -d "$TEMP_BUILD_DIR/server" ] && rsync -a "$TEMP_BUILD_DIR/server/" "$STANDALONE_DIR/.next/server/"

[ -d "$WEB_DIR/public" ] && cp -r "$WEB_DIR/public" "$STANDALONE_DIR/public"

# =============================================================================
# Phase 7b: Verify Chunk References
# =============================================================================
log_step "Verifying chunk references..."
CHUNKS_DIR="$STANDALONE_DIR/.next/server/chunks"
MISSING=0
while IFS= read -r route_file; do
    while IFS= read -r chunk; do
        if [ ! -f "$STANDALONE_DIR/.next/$chunk" ]; then
            log_error "Missing chunk: $chunk (referenced by $route_file)"
            MISSING=$((MISSING + 1))
        fi
    done < <(grep -oP '"server/chunks/[^"]*\.js"' "$route_file" 2>/dev/null | tr -d '"')
done < <(find "$STANDALONE_DIR/.next/server/app" -name "route.js" -o -name "page.js" 2>/dev/null)

if [ $MISSING -gt 0 ]; then
    log_error "$MISSING missing chunk(s) detected — build artifact is corrupt"
    exit 1
fi
log_step "All chunk references verified"

# =============================================================================
# Phase 8: Copy Workspace Packages
# =============================================================================
log_step "Copying workspace packages..."
STANDALONE_PACKAGES_DIR="$TEMP_BUILD_DIR/standalone/packages"
mkdir -p "$STANDALONE_PACKAGES_DIR"

# Use STANDALONE_PACKAGES array from lib/standalone-packages.sh (single source of truth)
for pkg in "${STANDALONE_PACKAGES[@]}"; do
    [ ! -d "packages/$pkg" ] && { log_error "Package not found: $pkg"; exit 1; }
    rm -rf "${STANDALONE_PACKAGES_DIR:?}/$pkg" 2>/dev/null || true
    # Use cp -rL to follow symlinks (bun creates symlinks to .bun/ cache)
    # This ensures dependencies like zod get copied as real files
    cp -rL "packages/$pkg" "$STANDALONE_PACKAGES_DIR/$pkg" 2>/dev/null || cp -r "packages/$pkg" "$STANDALONE_PACKAGES_DIR/$pkg"
done

# Copy template
[ ! -d "templates/site-template" ] && { log_error "Template not found"; exit 1; }
rm -rf "${STANDALONE_PACKAGES_DIR:?}/template" 2>/dev/null || true
cp -rL "templates/site-template" "$STANDALONE_PACKAGES_DIR/template" 2>/dev/null || cp -r "templates/site-template" "$STANDALONE_PACKAGES_DIR/template"

# =============================================================================
# Phase 9: Copy Packages to node_modules (NO SYMLINKS)
# =============================================================================
log_step "Copying packages to node_modules..."
STANDALONE_NODE_MODULES="$STANDALONE_DIR/node_modules"
mkdir -p "$STANDALONE_NODE_MODULES/@webalive"

# Copy workspace packages to node_modules/@webalive (actual copies, not symlinks)
# Include template which was copied separately
for pkg in "${STANDALONE_PACKAGES[@]}" template; do
    if [ -d "$STANDALONE_PACKAGES_DIR/$pkg" ]; then
        cp -rL "$STANDALONE_PACKAGES_DIR/$pkg" "$STANDALONE_NODE_MODULES/@webalive/$pkg" 2>/dev/null || \
        cp -r "$STANDALONE_PACKAGES_DIR/$pkg" "$STANDALONE_NODE_MODULES/@webalive/$pkg"
    elif [ -d "packages/$pkg" ]; then
        cp -rL "packages/$pkg" "$STANDALONE_NODE_MODULES/@webalive/$pkg" 2>/dev/null || \
        cp -r "packages/$pkg" "$STANDALONE_NODE_MODULES/@webalive/$pkg"
    fi
done

# Copy worker-entry.mjs (it's in src/ not dist/)
if [ -f "packages/worker-pool/src/worker-entry.mjs" ]; then
    mkdir -p "${STANDALONE_NODE_MODULES:?}/@webalive/worker-pool/dist/"
    cp "packages/worker-pool/src/worker-entry.mjs" "${STANDALONE_NODE_MODULES:?}/@webalive/worker-pool/dist/"
fi

# Worker-entry.mjs imports @webalive/tools - add it to worker-pool's node_modules
# Also need to add it to packages/worker-pool for the actual worker process
WORKER_POOL_PKG="$STANDALONE_PACKAGES_DIR/worker-pool"
if [ -d "$WORKER_POOL_PKG" ]; then
    mkdir -p "$WORKER_POOL_PKG/node_modules/@webalive"
    cp -rL "$STANDALONE_PACKAGES_DIR/tools" "$WORKER_POOL_PKG/node_modules/@webalive/tools" 2>/dev/null || \
    cp -r "$STANDALONE_PACKAGES_DIR/tools" "$WORKER_POOL_PKG/node_modules/@webalive/tools"
fi

# Copy zod dependency from the .bun cache (it's in the root standalone node_modules)
BUN_ZOD="$TEMP_BUILD_DIR/standalone/node_modules/.bun/node_modules/zod"
if [ -d "$BUN_ZOD" ]; then
    cp -rL "$BUN_ZOD" "$STANDALONE_NODE_MODULES/zod" 2>/dev/null || true
fi

# =============================================================================
# Phase 10: Atomic Swap
# =============================================================================
log_step "Moving to timestamped directory..."
mv "$TEMP_BUILD_DIR" "$TIMESTAMPED_DIR"

log_step "Atomic symlink swap..."
cd "$BUILDS_DIR"
ln -sfn "dist.$TIMESTAMP" "current.tmp" && mv -T "current.tmp" "current"
cd "$PROJECT_ROOT"

# Verify
ACTUAL=$(readlink "$BUILDS_DIR/current")
[ "$ACTUAL" != "dist.$TIMESTAMP" ] && { log_error "Symlink verification failed"; exit 1; }

log_step "Build: dist.$TIMESTAMP"
