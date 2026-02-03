#!/bin/bash
# Deploy shell-server-go independently
# Usage: ./deploy-go-server.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_step() { echo -e "${GREEN}[GO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GO_SERVER_DIR="$PROJECT_ROOT/apps/shell-server-go"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deploying shell-server-go"
echo "═══════════════════════════════════════════════════════"
echo ""

# Verify directory exists
if [ ! -d "$GO_SERVER_DIR" ]; then
    log_error "Go server directory not found: $GO_SERVER_DIR"
    exit 1
fi

cd "$GO_SERVER_DIR"

# Build
log_step "Building shell-server-go..."
if make build 2>&1; then
    log_success "Build successful"
else
    log_error "Build failed"
    exit 1
fi

# Restart service
SERVICE_NAME="shell-server-go"

if systemctl is-active --quiet "$SERVICE_NAME"; then
    log_step "Restarting $SERVICE_NAME systemd service..."
    systemctl restart "$SERVICE_NAME"
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "$SERVICE_NAME restarted successfully"
    else
        log_error "$SERVICE_NAME failed to start"
        log_step "Check logs: journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
else
    log_step "Starting $SERVICE_NAME systemd service..."
    systemctl start "$SERVICE_NAME"
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_success "$SERVICE_NAME started successfully"
    else
        log_error "$SERVICE_NAME failed to start"
        log_step "Check logs: journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════"
log_success "shell-server-go deployed successfully"
echo "  📡 Status:  systemctl status $SERVICE_NAME"
echo "  📜 Logs:    journalctl -u $SERVICE_NAME -f"
echo "═══════════════════════════════════════════════════════"
