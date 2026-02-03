#!/bin/bash
set -e

# Source common functions
source "$(dirname "$0")/lib/common.sh"

# Validate required environment variables
require_var SITE_SLUG SITE_PORT SITE_DOMAIN SERVICE_NAME

log_info "Starting systemd service: $SERVICE_NAME"

# Stop old PM2 process if exists
PM2_NAME=$(echo "$SITE_DOMAIN" | sed 's/\./-/g')
if command_exists pm2 && pm2 list | grep -q "$PM2_NAME"; then
    log_info "Stopping old PM2 process: $PM2_NAME"
    pm2 stop "$PM2_NAME" || true
    pm2 delete "$PM2_NAME" || true
fi

# Reload systemd daemon
log_info "Reloading systemd daemon..."
systemctl daemon-reload

# Start service
log_info "Starting service: $SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# Wait for service to become active (with polling, not fixed sleep)
log_info "Waiting for service to start..."
if ! wait_for 10 1 "systemctl is-active --quiet '$SERVICE_NAME'"; then
    log_error "Service failed to start within 10 seconds"
    log_error "Check logs with: journalctl -u $SERVICE_NAME -n 50"
    exit 15
fi

log_success "Service is active"

# Wait for port to be listening (with polling and retries)
log_info "Waiting for port $SITE_PORT to be listening..."
if ! wait_for 10 1 "port_in_use '$SITE_PORT'"; then
    log_error "Port $SITE_PORT is not listening after 10 seconds"
    log_error "Service may have failed to bind to port"
    log_error "Check logs with: journalctl -u $SERVICE_NAME -n 50"
    exit 16
fi

log_success "Port $SITE_PORT is listening"
exit 0
