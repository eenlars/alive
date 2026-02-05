#!/bin/bash
# =============================================================================
# SHIP - Claude Bridge Deployment Pipeline
# =============================================================================
#
# Usage:
#   ./ship.sh                    # Deploy staging → production
#   ./ship.sh --staging          # Deploy staging only
#   ./ship.sh --production       # Deploy production only
#   ./ship.sh --skip-e2e         # Skip E2E tests (faster)
#
# The pipeline ensures only one deployment runs at a time across all
# environments. Dev is handled separately (see deploy-dev.sh).
#
# Exit codes:
#   0 - Success
#   1 - Deployment failed or blocked
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/lock.sh"

# =============================================================================
# Configuration
# =============================================================================
DEPLOY_STAGING=true
DEPLOY_PRODUCTION=true
SKIP_E2E=false

# =============================================================================
# Parse Arguments
# =============================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --staging|-s)
            DEPLOY_STAGING=true
            DEPLOY_PRODUCTION=false
            shift
            ;;
        --production|-p)
            DEPLOY_STAGING=false
            DEPLOY_PRODUCTION=true
            shift
            ;;
        --skip-e2e)
            SKIP_E2E=true
            shift
            ;;
        --status)
            lock_status
            exit $?
            ;;
        --help|-h)
            head -20 "$0" | tail -15
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage"
            exit 1
            ;;
    esac
done

# =============================================================================
# Determine Target
# =============================================================================
if [ "$DEPLOY_STAGING" = true ] && [ "$DEPLOY_PRODUCTION" = true ]; then
    TARGET="staging+production"
    TARGET_DISPLAY="staging → production"
elif [ "$DEPLOY_STAGING" = true ]; then
    TARGET="staging"
    TARGET_DISPLAY="staging"
else
    TARGET="production"
    TARGET_DISPLAY="production"
fi

# =============================================================================
# Acquire Lock (includes orphan cleanup if stale lock detected)
# =============================================================================
if ! lock_acquire "$TARGET"; then
    exit 1
fi

# =============================================================================
# Main Pipeline
# =============================================================================
cd "$PROJECT_ROOT"
timer_start

banner "🚀 SHIP: Claude Bridge Deployment"

echo -e "Target: ${BOLD}$TARGET_DISPLAY${NC}"
[ "$SKIP_E2E" = true ] && echo -e "${YELLOW}⚠️  Skipping E2E tests${NC}"
echo ""

# -----------------------------------------------------------------------------
# Deploy Staging
# -----------------------------------------------------------------------------
if [ "$DEPLOY_STAGING" = true ]; then
    log_info "Deploying to staging..."
    lock_update_phase "staging"

    if [ "$SKIP_E2E" = true ]; then
        SKIP_E2E=1 "$SCRIPT_DIR/build-and-serve.sh" staging
    else
        "$SCRIPT_DIR/build-and-serve.sh" staging
    fi

    log_success "Staging deployed"
    echo ""
fi

# -----------------------------------------------------------------------------
# Deploy Production
# -----------------------------------------------------------------------------
if [ "$DEPLOY_PRODUCTION" = true ]; then
    log_info "Deploying to production..."
    lock_update_phase "production"

    if [ "$DEPLOY_STAGING" = true ]; then
        # Staging already validated: promote its build, skip checks and E2E
        PROMOTE_FROM=staging SKIP_E2E=1 \
            "$SCRIPT_DIR/build-and-serve.sh" production
    elif [ "$SKIP_E2E" = true ]; then
        SKIP_E2E=1 "$SCRIPT_DIR/build-and-serve.sh" production
    else
        "$SCRIPT_DIR/build-and-serve.sh" production
    fi

    log_success "Production deployed"
    echo ""
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
lock_update_phase "complete"
TOTAL_TIME=$(timer_elapsed)

banner_success "✓ SHIP COMPLETE"

echo -e "Total time: ${BOLD}$(format_duration $TOTAL_TIME)${NC}"
echo ""

echo -e "${BOLD}Health check:${NC}"
if [ "$DEPLOY_STAGING" = true ]; then
    if health_check "http://localhost:8998/" 1 1; then
        echo -e "  Staging (8998):    ${GREEN}✓${NC}"
    else
        echo -e "  Staging (8998):    ${RED}✗${NC}"
    fi
fi
if [ "$DEPLOY_PRODUCTION" = true ]; then
    if health_check "http://localhost:9000/" 1 1; then
        echo -e "  Production (9000): ${GREEN}✓${NC}"
    else
        echo -e "  Production (9000): ${RED}✗${NC}"
    fi
fi
echo ""
