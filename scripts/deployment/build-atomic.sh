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
    [ -d "$TEMP_BUILD_DIR" ] && rm -rf "$TEMP_BUILD_DIR"

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
    rm -rf "$DEV_BACKUP" 2>/dev/null || true
    mv "$WEB_NEXT_DIR/dev" "$DEV_BACKUP"
fi

# =============================================================================
# Phase 3: Clean & Validate
# =============================================================================
log_step "Cleaning build artifacts..."
rm -rf "$WEB_NEXT_DIR" "$PROJECT_ROOT/.turbo" "$PROJECT_ROOT/node_modules/.cache/turbo"
rm -rf "$WEB_DIR/dist" 2>/dev/null || true

log_step "Validating workspace..."
if ! "$SCRIPT_DIR/../validation/detect-workspace-issues.sh" >/dev/null 2>&1; then
    log_error "Workspace validation failed"
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

if ! bun run build --filter=web --force >/dev/null 2>&1; then
    log_error "Build failed"
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

[ -d "$TEMP_BUILD_DIR/static" ] && {
    mkdir -p "$STANDALONE_DIR/.next"
    cp -r "$TEMP_BUILD_DIR/static" "$STANDALONE_DIR/.next/static"
}

[ -d "$WEB_DIR/public" ] && cp -r "$WEB_DIR/public" "$STANDALONE_DIR/public"

# =============================================================================
# Phase 8: Copy Workspace Packages
# =============================================================================
log_step "Copying workspace packages..."
STANDALONE_PACKAGES="$TEMP_BUILD_DIR/standalone/packages"
mkdir -p "$STANDALONE_PACKAGES"

for pkg in tools images site-controller; do
    [ ! -d "packages/$pkg" ] && { log_error "Package not found: $pkg"; exit 1; }
    rm -rf "$STANDALONE_PACKAGES/$pkg" 2>/dev/null || true
    cp -r "packages/$pkg" "$STANDALONE_PACKAGES/$pkg"
    find "$STANDALONE_PACKAGES/$pkg" -type l -delete 2>/dev/null || true
done

# Copy template
[ ! -d "templates/site-template" ] && { log_error "Template not found"; exit 1; }
rm -rf "$STANDALONE_PACKAGES/template" 2>/dev/null || true
cp -r "templates/site-template" "$STANDALONE_PACKAGES/template"
find "$STANDALONE_PACKAGES/template" -type l -delete 2>/dev/null || true

# =============================================================================
# Phase 9: Create Package Symlinks
# =============================================================================
log_step "Creating package symlinks..."
STANDALONE_NODE_MODULES="$STANDALONE_DIR/node_modules"
mkdir -p "$STANDALONE_NODE_MODULES/@alive-brug" "$STANDALONE_NODE_MODULES/@webalive"

for pkg in tools images template; do
    ln -sf "../../../../packages/$pkg" "$STANDALONE_NODE_MODULES/@alive-brug/$pkg"
done
ln -sf "../../../../packages/site-controller" "$STANDALONE_NODE_MODULES/@webalive/site-controller"

# =============================================================================
# Phase 10: Atomic Swap
# =============================================================================
log_step "Moving to timestamped directory..."
mv "$TEMP_BUILD_DIR" "$TIMESTAMPED_DIR"

log_step "Atomic symlink swap..."
cd "$BUILDS_DIR"
ln -sfn "dist.$TIMESTAMP" "current"
cd "$PROJECT_ROOT"

# Verify
ACTUAL=$(readlink "$BUILDS_DIR/current")
[ "$ACTUAL" != "dist.$TIMESTAMP" ] && { log_error "Symlink verification failed"; exit 1; }

log_step "Build: dist.$TIMESTAMP"
