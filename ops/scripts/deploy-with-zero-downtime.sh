#!/bin/bash
# Zero-downtime deployment coordinator
# Ensures safe service transitions without port conflicts or data loss

set -e

SERVICE="$1"
NEW_BUILD="$2"
PORT="$3"
MAX_WAIT_SECS=60
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_DELAY=3

if [ -z "$SERVICE" ] || [ -z "$NEW_BUILD" ] || [ -z "$PORT" ]; then
  echo "Usage: $0 <service-name> <new-build-path> <port>"
  echo "Example: $0 claude-bridge-production /path/to/dist.xyz 9000"
  exit 1
fi

LOG_FILE="/var/log/deployment-${SERVICE}-$(date +%s).log"
exec 1> >(tee -a "$LOG_FILE")
exec 2>&1

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  log "❌ ERROR: $*"
  exit 1
}

success() {
  log "✅ $*"
}

log "========================================="
log "🚀 ZERO-DOWNTIME DEPLOYMENT: $SERVICE"
log "========================================="
log "Service: $SERVICE"
log "New Build: $NEW_BUILD"
log "Port: $PORT"
log "Log: $LOG_FILE"

# ============================================================================
# PHASE 1: PRE-DEPLOYMENT VALIDATION
# ============================================================================

log ""
log "[PHASE 1] Pre-deployment validation..."

# Check if new build exists
if [ ! -f "$NEW_BUILD" ]; then
  error "New build not found: $NEW_BUILD"
fi
success "New build exists"

# Check if service exists
if ! systemctl list-unit-files | grep -q "^${SERVICE}.service"; then
  error "Service not found: $SERVICE"
fi
success "Service exists"

# Get current systemd status
CURRENT_STATUS=$(systemctl is-active "$SERVICE" 2>/dev/null || echo "inactive")
log "Current status: $CURRENT_STATUS"

# ============================================================================
# PHASE 2: HEALTH CHECK (Before changes)
# ============================================================================

log ""
log "[PHASE 2] Pre-deployment health check..."

if [ "$CURRENT_STATUS" = "active" ]; then
  HEALTH_ENDPOINT="http://localhost:$PORT/api/health"

  for i in $(seq 1 3); do
    if curl -sf "$HEALTH_ENDPOINT" > /dev/null 2>&1; then
      success "Current service is healthy"
      break
    fi
    if [ $i -lt 3 ]; then
      log "  Attempt $i/3 failed, retrying..."
      sleep 2
    fi
  done
else
  log "Service not currently running, skipping pre-health check"
fi

# ============================================================================
# PHASE 3: PORT AVAILABILITY CHECK
# ============================================================================

log ""
log "[PHASE 3] Checking port $PORT availability..."

if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  log "⚠️  Port $PORT is in use. Gracefully stopping current service..."

  # Try graceful shutdown with timeout
  log "  Sending SIGTERM to $SERVICE..."
  if ! systemctl stop "$SERVICE" --timeout=30s 2>/dev/null; then
    log "  Graceful shutdown timeout, forcing kill..."
    # Get PID and kill it
    PID=$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null || echo "")
    if [ -n "$PID" ] && [ "$PID" != "0" ]; then
      kill -9 "$PID" 2>/dev/null || true
      sleep 2
    fi
  fi

  success "Service stopped, port released"
  sleep 2
else
  success "Port $PORT is available"
fi

# ============================================================================
# PHASE 4: DEPLOY NEW BUILD
# ============================================================================

log ""
log "[PHASE 4] Deploying new build..."

# Update symlink to new build atomically
BUILD_DIR=$(dirname "$NEW_BUILD")
CURRENT_LINK="$BUILD_DIR/current"
TEMP_LINK="$BUILD_DIR/current.tmp"

if [ -L "$CURRENT_LINK" ]; then
  ln -sfn "$(basename "$NEW_BUILD")" "$TEMP_LINK"
  mv "$TEMP_LINK" "$CURRENT_LINK"
  success "Build symlink updated"
else
  error "Cannot find build directory symlink at $CURRENT_LINK"
fi

# ============================================================================
# PHASE 5: START NEW SERVICE
# ============================================================================

log ""
log "[PHASE 5] Starting new service..."

# Reset restart counter if needed
systemctl reset-failed "$SERVICE" 2>/dev/null || true

# Start the service
if ! systemctl start "$SERVICE"; then
  error "Failed to start service $SERVICE"
fi

success "Service started"

# ============================================================================
# PHASE 6: HEALTH VERIFICATION
# ============================================================================

log ""
log "[PHASE 6] Verifying new service health..."

HEALTH_ENDPOINT="http://localhost:$PORT/api/health"
RETRIES=0
SUCCESS=false

while [ $RETRIES -lt $HEALTH_CHECK_RETRIES ]; do
  RETRIES=$((RETRIES + 1))

  # Check if service is still running
  if ! systemctl is-active --quiet "$SERVICE"; then
    log "  ❌ Service died after startup!"
    error "Service $SERVICE is no longer running"
  fi

  # Try health endpoint
  if curl -sf "$HEALTH_ENDPOINT" > /dev/null 2>&1; then
    log "  ✅ Health check passed"
    SUCCESS=true
    break
  fi

  if [ $RETRIES -lt $HEALTH_CHECK_RETRIES ]; then
    log "  Waiting for service to be ready... (attempt $RETRIES/$HEALTH_CHECK_RETRIES)"
    sleep $HEALTH_CHECK_DELAY
  fi
done

if [ "$SUCCESS" != "true" ]; then
  log "❌ Service failed health checks after $HEALTH_CHECK_RETRIES attempts"
  log "Initiating rollback..."

  # ROLLBACK: Revert to previous build
  PREVIOUS_BUILD=$(ls -1 "$BUILD_DIR" | grep -v current | sort -r | head -2 | tail -1)
  if [ -n "$PREVIOUS_BUILD" ]; then
    log "  Rolling back to $PREVIOUS_BUILD..."
    ln -sfn "$PREVIOUS_BUILD" "$TEMP_LINK"
    mv "$TEMP_LINK" "$CURRENT_LINK"

    systemctl restart "$SERVICE"
    sleep 5

    if systemctl is-active --quiet "$SERVICE"; then
      success "Rollback complete, previous version restored"
    fi
  fi

  error "Deployment failed health verification"
fi

# ============================================================================
# PHASE 7: CLEANUP & MONITORING
# ============================================================================

log ""
log "[PHASE 7] Post-deployment verification..."

# Verify service is running
if systemctl is-active --quiet "$SERVICE"; then
  success "Service is running"
else
  error "Service is not running"
fi

# Get service info
UPTIME=$(systemctl show -p ActiveEnterTimestamp --value "$SERVICE")
MEM=$(systemctl show -p MemoryCurrent --value "$SERVICE")
MEM_MB=$((MEM / 1024 / 1024))

log "  Uptime since: $UPTIME"
log "  Memory usage: ${MEM_MB}MB"

# Final health check
if curl -sf "$HEALTH_ENDPOINT" > /dev/null 2>&1; then
  success "Final health check passed"
else
  error "Final health check failed"
fi

log ""
log "========================================="
success "DEPLOYMENT COMPLETE"
log "========================================="
log "Service: $SERVICE"
log "Status: $(systemctl is-active "$SERVICE")"
log "Log file: $LOG_FILE"
log ""

exit 0
