#!/bin/bash
# Pre-deployment safety checks
# Run this BEFORE attempting any deployment to catch issues early

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENVIRONMENT="${1:-staging}"
VERBOSE="${2:-0}"

if [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
  echo "Usage: $0 [staging|production] [verbose]"
  exit 1
fi

case "$ENVIRONMENT" in
  staging)
    SERVICE="alive-staging"
    PORT=8998
    ;;
  production)
    SERVICE="alive-production"
    PORT=9000
    ;;
esac

echo "========================================="
echo "🔍 PRE-DEPLOYMENT CHECKS: $ENVIRONMENT"
echo "========================================="
echo ""

ISSUES=0

# ============================================================================
# CHECK 1: Service exists and is healthy
# ============================================================================

echo "[1/7] Checking service status..."
if systemctl list-unit-files | grep -q "^${SERVICE}.service"; then
  STATUS=$(systemctl is-active "$SERVICE" 2>/dev/null || echo "unknown")
  echo "  ✅ Service exists: $STATUS"

  if [ "$STATUS" = "failed" ]; then
    echo "  ⚠️  WARNING: Service is in failed state"
    echo "  Run: systemctl reset-failed $SERVICE"
    ISSUES=$((ISSUES + 1))
  fi
else
  echo "  ❌ Service not found: $SERVICE"
  ISSUES=$((ISSUES + 1))
fi

# ============================================================================
# CHECK 2: Restart limits not exceeded
# ============================================================================

echo "[2/7] Checking restart limits..."
NRestarts=$(systemctl show -p NRestarts --value "$SERVICE" 2>/dev/null || echo "0")
StartLimitBurst=$(systemctl show -p StartLimitBurst --value "$SERVICE" 2>/dev/null || echo "3")

if [ "$NRestarts" -ge "$StartLimitBurst" ]; then
  echo "  ❌ CRITICAL: Service has hit restart limit ($NRestarts >= $StartLimitBurst)"
  echo "  Run: systemctl reset-failed $SERVICE"
  ISSUES=$((ISSUES + 1))
else
  echo "  ✅ Restart limit OK ($NRestarts / $StartLimitBurst)"
fi

# ============================================================================
# CHECK 3: Port availability
# ============================================================================

echo "[3/7] Checking port $PORT availability..."
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "  ✅ Port $PORT is in use (service running)"
else
  if [ "$STATUS" = "active" ]; then
    echo "  ⚠️  WARNING: Service is 'active' but port $PORT is not listening"
    echo "  This might indicate a startup failure"
    ISSUES=$((ISSUES + 1))
  else
    echo "  ✅ Port $PORT is available"
  fi
fi

# ============================================================================
# CHECK 4: Disk space
# ============================================================================

echo "[4/7] Checking disk space..."
BUILD_DIR="$PROJECT_ROOT/.builds/$ENVIRONMENT"

# Guard against missing build directory
if [[ ! -d "$BUILD_DIR" ]]; then
  echo "  ⚠️  Build directory not yet created: $BUILD_DIR"
  DISK_USAGE=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
else
  DISK_USAGE=$(df "$BUILD_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
fi

if [ "$DISK_USAGE" -gt 80 ]; then
  echo "  ❌ CRITICAL: Disk usage is ${DISK_USAGE}% (> 80%)"
  echo "  Free up space before deployment"
  ISSUES=$((ISSUES + 1))
elif [ "$DISK_USAGE" -gt 70 ]; then
  echo "  ⚠️  WARNING: Disk usage is ${DISK_USAGE}% (> 70%)"
else
  echo "  ✅ Disk usage OK (${DISK_USAGE}%)"
fi

# ============================================================================
# CHECK 5: Memory available
# ============================================================================

echo "[5/7] Checking available memory..."
MEM_AVAILABLE=$(free -m | awk 'NR==2 {print $7}')

if [ "$MEM_AVAILABLE" -lt 500 ]; then
  echo "  ❌ CRITICAL: Available memory is ${MEM_AVAILABLE}MB (< 500MB)"
  echo "  Run: systemctl status and check running services"
  ISSUES=$((ISSUES + 1))
elif [ "$MEM_AVAILABLE" -lt 1000 ]; then
  echo "  ⚠️  WARNING: Available memory is ${MEM_AVAILABLE}MB (< 1GB)"
else
  echo "  ✅ Available memory OK (${MEM_AVAILABLE}MB)"
fi

# ============================================================================
# CHECK 6: Health endpoint
# ============================================================================

echo "[6/7] Checking health endpoint..."
HEALTH_ENDPOINT="http://localhost:$PORT/api/health"

if curl -sf "$HEALTH_ENDPOINT" > /dev/null 2>&1; then
  echo "  ✅ Health endpoint responding"
else
  if [ "$STATUS" = "active" ]; then
    echo "  ⚠️  WARNING: Health endpoint not responding (service may be starting)"
  else
    echo "  ℹ️  Service not running (health check skipped)"
  fi
fi

# ============================================================================
# CHECK 7: Build directory structure
# ============================================================================

echo "[7/7] Checking build directory structure..."
if [ -d "$BUILD_DIR" ]; then
  CURRENT_LINK="$BUILD_DIR/current"
  if [ -L "$CURRENT_LINK" ]; then
    CURRENT_BUILD=$(readlink "$CURRENT_LINK")
    echo "  ✅ Build structure OK (current: $CURRENT_BUILD)"
  else
    echo "  ❌ Current symlink not found at $CURRENT_LINK"
    ISSUES=$((ISSUES + 1))
  fi
else
  echo "  ❌ Build directory not found: $BUILD_DIR"
  ISSUES=$((ISSUES + 1))
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "========================================="

if [ $ISSUES -eq 0 ]; then
  echo "✅ ALL CHECKS PASSED - Ready for deployment"
  echo "========================================="
  exit 0
else
  echo "❌ $ISSUES ISSUE(S) FOUND - Fix before deployment"
  echo "========================================="
  exit 1
fi
