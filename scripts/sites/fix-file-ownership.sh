#!/bin/bash

# Migration script to fix root-owned files in site workspaces
# Implements Patrick's recommended migration sequence

set -euo pipefail

SITES_BASE="/srv/webalive/sites"
DRY_RUN=${DRY_RUN:-false}

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

# Function to fix ownership for a single site
fix_site_ownership() {
    local site_dir="$1"
    local domain=$(basename "$site_dir")

    log "Processing site: $domain"

    # Check if site directory exists
    if [[ ! -d "$site_dir" ]]; then
        warn "Site directory does not exist: $site_dir"
        return 1
    fi

    # Check if user directory exists
    local user_dir="$site_dir/user"
    if [[ ! -d "$user_dir" ]]; then
        warn "User directory does not exist: $user_dir (skipping)"
        return 1
    fi

    # Detect the correct site user from directory ownership
    local site_user=$(stat -c '%U' "$site_dir" 2>/dev/null || echo "")
    local site_group=$(stat -c '%G' "$site_dir" 2>/dev/null || echo "")

    if [[ -z "$site_user" || "$site_user" == "root" ]]; then
        error "Cannot determine site user for $domain (directory owned by root)"
        return 1
    fi

    log "  Site user: $site_user:$site_group"

    # Find root-owned files in the user directory
    local root_files
    root_files=$(find "$user_dir" -xdev \( -type f -o -type d \) -user root 2>/dev/null | wc -l)

    if [[ "$root_files" -eq 0 ]]; then
        success "  No root-owned files found in $domain"
        return 0
    fi

    log "  Found $root_files root-owned files/directories"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "  [DRY RUN] Would fix ownership of $root_files items"
        find "$user_dir" -xdev \( -type f -o -type d \) -user root -ls 2>/dev/null | head -10
        if [[ "$root_files" -gt 10 ]]; then
            log "  [DRY RUN] ... and $(($root_files - 10)) more files"
        fi
        return 0
    fi

    # Fix ownership (Patrick's recommended command)
    log "  Fixing ownership..."
    if find "$user_dir" -xdev \( -type f -o -type d \) -user root -exec chown "$site_user:$site_group" {} + 2>/dev/null; then
        success "  Fixed ownership for $domain"
    else
        error "  Failed to fix ownership for $domain"
        return 1
    fi
}

# Main execution
main() {
    log "Starting file ownership migration"
    log "Sites base directory: $SITES_BASE"
    log "Dry run mode: $DRY_RUN"

    if [[ "$DRY_RUN" == "true" ]]; then
        warn "DRY RUN MODE - No changes will be made"
        warn "Run with DRY_RUN=false to apply changes"
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
    local failed_sites=0

    # Process each site directory
    for site_dir in "$SITES_BASE"/*; do
        if [[ -d "$site_dir" && ! -L "$site_dir" ]]; then
            ((total_sites++))
            if fix_site_ownership "$site_dir"; then
                ((successful_sites++))
            else
                ((failed_sites++))
            fi
        fi
    done

    log "Migration complete"
    log "Total sites processed: $total_sites"
    log "Successful: $successful_sites"
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
        echo "Fix file ownership in site workspaces (convert root-owned files to site user ownership)"
        echo ""
        echo "Options:"
        echo "  --dry-run    Show what would be changed without making changes"
        echo "  --help       Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  DRY_RUN=true    Same as --dry-run flag"
        echo ""
        echo "Examples:"
        echo "  $0 --dry-run                    # Preview changes"
        echo "  DRY_RUN=true $0                # Preview changes"
        echo "  $0                              # Apply changes"
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