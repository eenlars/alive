#!/bin/bash
# Sync Claude credentials and restart production if changed
# Run this after /login or when credentials issues occur

CREDS_FILE="/root/.claude/.credentials.json"
HASH_FILE="/tmp/.credentials.hash"

# Get current hash
CURRENT_HASH=$(md5sum "$CREDS_FILE" 2>/dev/null | cut -d' ' -f1)
PREVIOUS_HASH=$(cat "$HASH_FILE" 2>/dev/null)

if [ "$CURRENT_HASH" != "$PREVIOUS_HASH" ]; then
    echo "[sync-credentials] Credentials changed, restarting production..."
    systemctl restart alive-production
    echo "$CURRENT_HASH" > "$HASH_FILE"
    echo "[sync-credentials] Done"
else
    echo "[sync-credentials] No changes detected"
fi
