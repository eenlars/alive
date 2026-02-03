#!/bin/bash
# Sync site deployment modes between override configs and registry
# This ensures all sites are running their intended mode

set -e

REGISTRY="/var/lib/webalive/site-modes.json"
OVERRIDE_DIR="/etc/systemd/system"
SITES_DIR="/srv/webalive/sites"
LOG_FILE="/var/log/webalive-sync-modes.log"

log_message() {
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

# Ensure registry exists
if [ ! -f "$REGISTRY" ]; then
  log_message "ERROR: Registry not found at $REGISTRY"
  exit 1
fi

log_message "Starting site mode sync..."

SYNCED=0
MISMATCHED=0
FIXED=0

# Scan all site directories
for SITE_PATH in "$SITES_DIR"/*; do
  if [ ! -d "$SITE_PATH" ]; then
    continue
  fi

  DOMAIN=$(basename "$SITE_PATH")
  SLUG=$(echo "$DOMAIN" | sed 's/\./-/g')
  SERVICE="site@${SLUG}.service"
  OVERRIDE_PATH="$OVERRIDE_DIR/${SERVICE}.d/override.conf"

  # Check if override exists
  if [ ! -f "$OVERRIDE_PATH" ]; then
    log_message "WARN: No override config for $DOMAIN (using base template: dev)"
    continue
  fi

  # Extract the mode from override
  CURRENT_MODE=$(grep -oP "bun run \K\w+" "$OVERRIDE_PATH" 2>/dev/null || echo "unknown")

  # Extract mode from registry (if exists)
  REGISTRY_MODE=$(jq -r ".sites.\"$DOMAIN\"" "$REGISTRY" 2>/dev/null || echo "null")

  if [ "$REGISTRY_MODE" = "null" ]; then
    # Add to registry
    jq ".sites.\"$DOMAIN\" = \"$CURRENT_MODE\"" "$REGISTRY" > "$REGISTRY.tmp" && mv "$REGISTRY.tmp" "$REGISTRY"
    log_message "ADDED: $DOMAIN -> $CURRENT_MODE"
    SYNCED=$((SYNCED + 1))
  elif [ "$REGISTRY_MODE" != "$CURRENT_MODE" ]; then
    log_message "MISMATCH: $DOMAIN - Registry says '$REGISTRY_MODE', override has '$CURRENT_MODE'"
    MISMATCHED=$((MISMATCHED + 1))
  else
    log_message "OK: $DOMAIN -> $CURRENT_MODE"
    SYNCED=$((SYNCED + 1))
  fi
done

log_message "Sync complete - Synced: $SYNCED, Mismatched: $MISMATCHED, Fixed: $FIXED"
exit 0
