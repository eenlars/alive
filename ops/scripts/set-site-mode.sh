#!/bin/bash
# Set deployment mode for a specific site and reload systemd
# Usage: set-site-mode.sh <domain> <mode>
# Modes: dev, preview, start

set -e

DOMAIN="$1"
MODE="$2"
REGISTRY="/var/lib/webalive/site-modes.json"
OVERRIDE_DIR="/etc/systemd/system"

if [ -z "$DOMAIN" ] || [ -z "$MODE" ]; then
  echo "Usage: $0 <domain> <dev|preview|start>"
  exit 1
fi

# Validate mode
case "$MODE" in
  dev|preview|start)
    ;;
  *)
    echo "ERROR: Invalid mode '$MODE'. Must be: dev, preview, or start"
    exit 1
    ;;
esac

SLUG=$(echo "$DOMAIN" | sed 's/\./-/g')
SERVICE="site@${SLUG}.service"
OVERRIDE_PATH="$OVERRIDE_DIR/${SERVICE}.d/override.conf"

echo "Setting $DOMAIN to $MODE mode..."

# Create override directory if needed
mkdir -p "$(dirname "$OVERRIDE_PATH")"

# Create/update override config
cat > "$OVERRIDE_PATH" << EOF
[Service]
ExecStart=
ExecStart=/bin/sh -c 'exec /usr/local/bin/bun run $MODE'
EOF

chmod 644 "$OVERRIDE_PATH"

# Update registry
if [ -f "$REGISTRY" ]; then
  jq ".sites.\"$DOMAIN\" = \"$MODE\"" "$REGISTRY" > "$REGISTRY.tmp"
  mv "$REGISTRY.tmp" "$REGISTRY"
fi

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

# Restart the service
echo "Restarting $SERVICE..."
systemctl restart "$SERVICE"

sleep 2

# Verify
if systemctl is-active --quiet "$SERVICE"; then
  echo "✓ SUCCESS: $DOMAIN now running in $MODE mode"
  systemctl status "$SERVICE" | head -10
  exit 0
else
  echo "✗ ERROR: Service failed to start"
  systemctl status "$SERVICE"
  journalctl -u "$SERVICE" -n 20
  exit 1
fi
