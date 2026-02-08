#!/bin/bash
# =============================================================================
# Production Health Check with Alerting
# =============================================================================
# Checks if production is responding and alerts via ntfy if down.
# Run via cron: */5 * * * * <project-root>/scripts/maintenance/health-check.sh
#
# To set up ntfy alerts:
# 1. Install ntfy: curl -sSL https://install.ntfy.sh | bash
# 2. Subscribe on phone: ntfy.sh/alive-alerts (or your custom topic)
# =============================================================================

set -euo pipefail

PROD_URL="https://sonno.tech/"
STAGING_URL="https://staging.sonno.tech/"
NTFY_TOPIC="${NTFY_TOPIC:-alive-alerts}"
TIMEOUT=10
STATE_FILE="/tmp/alive-health-state"

check_url() {
    local url=$1
    local name=$2

    if curl -sf --max-time "$TIMEOUT" "$url" > /dev/null 2>&1; then
        echo "$name: OK"
        return 0
    else
        echo "$name: DOWN"
        return 1
    fi
}

send_alert() {
    local title=$1
    local message=$2
    local priority=${3:-high}

    curl -sf \
        -H "Title: $title" \
        -H "Priority: $priority" \
        -H "Tags: warning" \
        -d "$message" \
        "https://ntfy.sh/$NTFY_TOPIC" > /dev/null 2>&1 || true
}

# Check production
if ! check_url "$PROD_URL" "Production"; then
    # Only alert if this is a new failure (avoid spam)
    if [ ! -f "$STATE_FILE" ] || [ "$(cat "$STATE_FILE")" != "down" ]; then
        send_alert "🔴 Production DOWN" "sonno.tech is not responding. Check: journalctl -u alive-production -n 50"
        echo "down" > "$STATE_FILE"
    fi
else
    # Clear state if recovered
    if [ -f "$STATE_FILE" ] && [ "$(cat "$STATE_FILE")" = "down" ]; then
        send_alert "🟢 Production RECOVERED" "sonno.tech is back online" "default"
    fi
    rm -f "$STATE_FILE"
fi

# Also check staging (optional, lower priority)
check_url "$STAGING_URL" "Staging" || true
