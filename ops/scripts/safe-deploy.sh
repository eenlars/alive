#!/bin/bash
# Safe deployment wrapper
# Ensures all pre-flight checks pass before allowing deployment

set -e

ENVIRONMENT="${1:-staging}"
FORCE_DEPLOY="${2:-false}"

if [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
  echo "Usage: $0 [staging|production] [--force]"
  echo ""
  echo "Examples:"
  echo "  $0 staging          # Deploy to staging (with checks)"
  echo "  $0 production        # Deploy to production (with checks)"
  echo "  $0 production --force # Skip pre-checks (NOT RECOMMENDED)"
  exit 1
fi

# Parse flags
if [ "$FORCE_DEPLOY" = "--force" ]; then
  FORCE_DEPLOY="true"
else
  FORCE_DEPLOY="false"
fi

case "$ENVIRONMENT" in
  staging)
    SERVICE="claude-bridge-staging"
    PORT=8998
    BUILD_DIR="/root/webalive/claude-bridge/.builds/staging"
    ;;
  production)
    SERVICE="claude-bridge-production"
    PORT=9000
    BUILD_DIR="/root/webalive/claude-bridge/.builds/production"
    ;;
esac

echo ""
echo "========================================="
echo "🚀 SAFE DEPLOYMENT: $ENVIRONMENT"
echo "========================================="
echo ""

# ============================================================================
# PRE-DEPLOYMENT CHECKS
# ============================================================================

if [ "$FORCE_DEPLOY" != "true" ]; then
  echo "Running pre-deployment checks..."
  echo ""

  if ! /usr/local/bin/pre-deployment-check.sh "$ENVIRONMENT"; then
    echo ""
    echo "❌ Pre-deployment checks FAILED"
    echo ""
    echo "To skip checks and force deployment, run:"
    echo "  $0 $ENVIRONMENT --force"
    echo ""
    exit 1
  fi

  echo ""
else
  echo "⚠️  FORCE MODE: Skipping pre-deployment checks"
  echo "   This is NOT recommended for production"
  echo ""
fi

# ============================================================================
# DEPLOYMENT
# ============================================================================

echo ""
echo "Starting safe deployment..."
echo ""

# Find the newest build
NEWEST_BUILD=$(ls -1 "$BUILD_DIR" | grep "^dist\." | sort -V | tail -1)

if [ -z "$NEWEST_BUILD" ]; then
  echo "❌ No builds found in $BUILD_DIR"
  exit 1
fi

NEWEST_BUILD_PATH="$BUILD_DIR/$NEWEST_BUILD"
CURRENT_BUILD=$(readlink "$BUILD_DIR/current" 2>/dev/null || echo "unknown")

if [ "$NEWEST_BUILD" = "$CURRENT_BUILD" ]; then
  echo "⚠️  Newest build ($NEWEST_BUILD) is already deployed"
  echo ""
  echo "To force re-deployment, delete the current build and rebuild:"
  echo "  rm -rf $BUILD_DIR/$NEWEST_BUILD"
  exit 0
fi

echo "Current build: $CURRENT_BUILD"
echo "New build: $NEWEST_BUILD"
echo ""

# Run zero-downtime deployment
/usr/local/bin/deploy-with-zero-downtime.sh "$SERVICE" "$NEWEST_BUILD_PATH" "$PORT"

DEPLOY_RESULT=$?

if [ $DEPLOY_RESULT -eq 0 ]; then
  echo ""
  echo "========================================="
  echo "✅ DEPLOYMENT SUCCESSFUL"
  echo "========================================="
  echo ""
  echo "Service: $SERVICE"
  echo "Build: $NEWEST_BUILD"
  echo "Endpoint: http://localhost:$PORT"
  echo ""
else
  echo ""
  echo "========================================="
  echo "❌ DEPLOYMENT FAILED"
  echo "========================================="
  echo ""
  echo "Check logs for details"
  exit 1
fi

exit 0
