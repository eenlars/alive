#!/bin/bash
# =============================================================================
# Standalone Packages Configuration
# =============================================================================
# Single source of truth for packages that must be copied to standalone builds.
#
# ⚠️  IMPORTANT: When adding a new @webalive package that the app imports,
#     add it to STANDALONE_PACKAGES below. Forgetting this will cause runtime
#     errors like "module not found" in production.
#
# These packages are copied to:
#   - standalone/packages/           (for subprocess access)
#   - standalone/node_modules/@webalive/  (for app imports)
#
# Validation runs during build to catch missing packages.
# =============================================================================

# Packages to copy to standalone build
# Format: space-separated list of package names (from packages/ directory)
STANDALONE_PACKAGES=(
    tools
    images
    shared
    worker-pool
    site-controller
    database
)

# Packages that have external dependencies needed in subprocess
# These get their node_modules copied too (via cp -rL)
SUBPROCESS_PACKAGES=(
    worker-pool
)
