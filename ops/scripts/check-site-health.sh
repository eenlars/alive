#!/bin/bash
# Health check script for WebAlive sites
# Usage: check-site-health.sh <domain> [port]

DOMAIN="$1"
PORT="${2:-3656}"
TIMEOUT=5

if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <domain> [port]"
  exit 1
fi

# Convert domain to slug for systemd service name
SLUG=$(echo "$DOMAIN" | sed 's/\./-/g')

# Check if service exists and is running
if ! systemctl is-active --quiet site@$SLUG.service; then
  echo "ERROR: Service site@$SLUG.service is not running"
  echo "Attempting restart..."
  systemctl restart site@$SLUG.service
  sleep 5
  if ! systemctl is-active --quiet site@$SLUG.service; then
    echo "CRITICAL: Failed to restart service"
    exit 1
  fi
fi

# Check if port is listening
if ! nc -z -w $TIMEOUT localhost $PORT 2>/dev/null; then
  echo "WARNING: Port $PORT not responding"
  echo "Service status:"
  systemctl status site@$SLUG.service
  exit 1
fi

echo "OK: Service is healthy"
exit 0
