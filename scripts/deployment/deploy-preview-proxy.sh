#!/bin/bash
# =============================================================================
# Deploy preview-proxy (Go binary)
# =============================================================================
# Builds the Go preview-proxy, installs the generated systemd service,
# seeds port-map.json if missing, and restarts.
#
# Skips gracefully if:
#   - Go is not installed
#   - previewProxy.port is not set in server-config.json
#
# Usage: ./deploy-preview-proxy.sh
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

log_step() { echo -e "${GREEN}[PREVIEW-PROXY]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[PREVIEW-PROXY]${NC} $1"; }
log_error() { echo -e "${RED}[PREVIEW-PROXY]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROXY_DIR="$PROJECT_ROOT/apps/preview-proxy"
CONFIG_PATH="${SERVER_CONFIG_PATH:-/var/lib/alive/server-config.json}"
SERVICE_NAME="preview-proxy"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deploying preview-proxy"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Check: Go installed? ────────────────────────────────────────────────────
if ! command -v go >/dev/null 2>&1; then
    log_warn "Go not installed — skipping preview-proxy build"
    exit 0
fi

# ─── Check: previewProxy.port configured? ────────────────────────────────────
if [ ! -f "$CONFIG_PATH" ]; then
    log_warn "server-config.json not found at $CONFIG_PATH — skipping"
    exit 0
fi

PREVIEW_PORT=$(bun -e "
  const c = JSON.parse(require('fs').readFileSync('$CONFIG_PATH','utf8'));
  console.log(c.previewProxy?.port ?? '');
")

if [ -z "$PREVIEW_PORT" ]; then
    log_warn "previewProxy.port not set in server-config.json — skipping"
    exit 0
fi

log_step "Preview proxy configured on port $PREVIEW_PORT"

# ─── Check: proxy directory exists? ──────────────────────────────────────────
if [ ! -d "$PROXY_DIR" ]; then
    log_error "Proxy directory not found: $PROXY_DIR"
    exit 1
fi

# ─── Build ───────────────────────────────────────────────────────────────────
log_step "Building preview-proxy..."
cd "$PROXY_DIR"
if bun run build 2>&1; then
    log_success "Build successful"
else
    log_error "Build failed"
    exit 1
fi
cd "$PROJECT_ROOT"

# ─── Seed port-map.json if missing ──────────────────────────────────────────
GENERATED_DIR=$(bun -e "
  const c = JSON.parse(require('fs').readFileSync('$CONFIG_PATH','utf8'));
  console.log(c.generated?.dir ?? '/var/lib/alive/generated');
")
PORT_MAP="$GENERATED_DIR/port-map.json"

if [ ! -f "$PORT_MAP" ]; then
    log_step "Seeding port-map.json..."
    mkdir -p "$GENERATED_DIR"
    if bun "$PROJECT_ROOT/scripts/generate-port-map.ts" 2>&1; then
        log_success "port-map.json generated"
    else
        log_warn "Failed to generate port-map.json — proxy will start with empty map"
        echo '{}' > "$PORT_MAP"
    fi
fi

# ─── Install systemd service if changed ──────────────────────────────────────
GENERATED_SERVICE="$GENERATED_DIR/$SERVICE_NAME.service"
INSTALLED_SERVICE="/etc/systemd/system/$SERVICE_NAME.service"

if [ -f "$GENERATED_SERVICE" ]; then
    if [ ! -f "$INSTALLED_SERVICE" ] || ! diff -q "$GENERATED_SERVICE" "$INSTALLED_SERVICE" >/dev/null 2>&1; then
        log_step "Installing updated systemd service..."
        cp "$GENERATED_SERVICE" "$INSTALLED_SERVICE"
        systemctl daemon-reload
        log_success "Service file installed"
    else
        log_step "Service file unchanged"
    fi
else
    log_warn "No generated service file found at $GENERATED_SERVICE"
    log_warn "Run: bun run gen:systemd"
    exit 1
fi

# ─── Restart service ─────────────────────────────────────────────────────────
if systemctl is-active --quiet "$SERVICE_NAME"; then
    log_step "Restarting $SERVICE_NAME..."
    systemctl restart "$SERVICE_NAME"
else
    log_step "Starting $SERVICE_NAME..."
    systemctl start "$SERVICE_NAME"
fi

sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
    log_success "$SERVICE_NAME running"
else
    log_error "$SERVICE_NAME failed to start"
    log_step "Check logs: journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi

# ─── Health check ────────────────────────────────────────────────────────────
log_step "Health check on port $PREVIEW_PORT..."
if curl -sf "http://localhost:$PREVIEW_PORT/health" >/dev/null 2>&1; then
    log_success "Health check passed"
else
    log_warn "Health check failed (service may still be starting)"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
log_success "preview-proxy deployed on port $PREVIEW_PORT"
echo -e "  ${DIM}Status:${NC}  systemctl status $SERVICE_NAME"
echo -e "  ${DIM}Logs:${NC}    journalctl -u $SERVICE_NAME -f"
echo "═══════════════════════════════════════════════════════"
