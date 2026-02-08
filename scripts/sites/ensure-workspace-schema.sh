#!/bin/bash

# Migration script to ensure all existing sites have the workspace schema directories
# Creates .alive/files/ and .schema-version for every site workspace
#
# Pattern from fix-file-ownership.sh

set -euo pipefail

SERVER_CONFIG="${SERVER_CONFIG_PATH:-}"
if [[ -z "$SERVER_CONFIG" ]]; then
    echo "ERROR: SERVER_CONFIG_PATH env var is not set." >&2
    echo "Set it to the path of server-config.json (e.g., /var/lib/alive/server-config.json)" >&2
    exit 1
fi
DRY_RUN=${DRY_RUN:-false}
SCHEMA_VERSION="1"

# Read sitesRoot from server-config.json (single source of truth)
if [[ ! -f "$SERVER_CONFIG" ]]; then
    echo "ERROR: Server config not found: $SERVER_CONFIG" >&2
    echo "Each server must have this file. See ops/server-config.example.json" >&2
    exit 1
fi

# Extract paths.sitesRoot using lightweight JSON parsing (no jq dependency)
SITES_BASE=$(python3 -c "import json,sys; print(json.load(open('$SERVER_CONFIG'))['paths']['sitesRoot'])" 2>/dev/null) || {
    echo "ERROR: Failed to read paths.sitesRoot from $SERVER_CONFIG" >&2
    exit 1
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

# Ensure workspace schema for a single site
ensure_schema() {
    local site_dir="$1"
    local domain
    domain=$(basename "$site_dir")

    log "Processing site: $domain"

    # Skip symlinks
    if [[ -L "$site_dir" ]]; then
        log "  Skipping symlink: $site_dir"
        return 0
    fi

    # Check if user directory exists
    local user_dir="$site_dir/user"
    if [[ ! -d "$user_dir" ]]; then
        warn "  No user/ directory (skipping): $site_dir"
        return 0
    fi

    # Check if already at current schema version
    local version_file="$user_dir/.alive/.schema-version"
    if [[ -f "$version_file" ]]; then
        local current_version
        current_version=$(cat "$version_file" 2>/dev/null || echo "0")
        if [[ "$current_version" -ge "$SCHEMA_VERSION" ]]; then
            success "  Already at schema version $current_version"
            return 0
        fi
        log "  Upgrading from schema version $current_version to $SCHEMA_VERSION"
    fi

    # Detect the correct site user from directory ownership
    local site_user
    local site_group
    site_user=$(stat -c '%U' "$site_dir" 2>/dev/null || echo "")
    site_group=$(stat -c '%G' "$site_dir" 2>/dev/null || echo "")

    if [[ -z "$site_user" || "$site_user" == "root" ]]; then
        error "  Cannot determine site user for $domain (directory owned by root)"
        return 1
    fi

    log "  Site user: $site_user:$site_group"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "  [DRY RUN] Would create: $user_dir/.alive/files/"
        log "  [DRY RUN] Would write:  $version_file (version $SCHEMA_VERSION)"
        log "  [DRY RUN] Would chown:  $site_user:$site_group"
        return 0
    fi

    # Create directories
    mkdir -p "$user_dir/.alive/files"

    # Write schema version
    echo "$SCHEMA_VERSION" > "$version_file"

    # Fix ownership
    chown -R "$site_user:$site_group" "$user_dir/.alive"

    success "  Schema v$SCHEMA_VERSION applied for $domain"
}

# Main execution
main() {
    log "Ensuring workspace schema v$SCHEMA_VERSION for all sites"
    log "Sites base directory: $SITES_BASE"
    log "Dry run mode: $DRY_RUN"

    if [[ "$DRY_RUN" == "true" ]]; then
        warn "DRY RUN MODE - No changes will be made"
        warn "Run without --dry-run to apply changes"
    fi

    # Check if we're running as root
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
        exit 1
    fi

    # Check if sites base exists
    if [[ ! -d "$SITES_BASE" ]]; then
        error "Sites base directory does not exist: $SITES_BASE"
        exit 1
    fi

    local total_sites=0
    local successful_sites=0
    local skipped_sites=0
    local failed_sites=0

    # Process each site directory
    for site_dir in "$SITES_BASE"/*; do
        if [[ -d "$site_dir" && ! -L "$site_dir" ]]; then
            ((total_sites++))
            if ensure_schema "$site_dir"; then
                ((successful_sites++))
            else
                ((failed_sites++))
            fi
        else
            ((skipped_sites++))
        fi
    done

    log ""
    log "Migration complete"
    log "Total sites: $total_sites"
    log "Successful: $successful_sites"
    log "Skipped (symlinks): $skipped_sites"
    log "Failed: $failed_sites"

    if [[ "$failed_sites" -gt 0 ]]; then
        warn "Some sites failed to process. Check the logs above."
        exit 1
    fi

    success "All sites processed successfully"
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [--dry-run] [--help]"
        echo ""
        echo "Ensure all site workspaces have the required schema directories."
        echo "Creates .alive/files/ and .alive/.schema-version for each site."
        echo ""
        echo "Options:"
        echo "  --dry-run    Show what would be changed without making changes"
        echo "  --help       Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  DRY_RUN=true    Same as --dry-run flag"
        echo ""
        echo "Examples:"
        echo "  $0 --dry-run    # Preview changes"
        echo "  $0              # Apply changes"
        exit 0
        ;;
    --dry-run)
        DRY_RUN=true
        ;;
    "")
        # No arguments, proceed normally
        ;;
    *)
        error "Unknown argument: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac

main
