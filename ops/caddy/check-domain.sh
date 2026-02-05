#!/bin/bash
# Simple domain checker for Caddy on-demand TLS
# Returns 200 for domains matching the wildcard domain, 403 otherwise

DOMAIN="$1"
SERVER_CONFIG="/var/lib/alive/server-config.json"

# Read wildcard domain from server config
if [[ -f "$SERVER_CONFIG" ]] && command -v jq &> /dev/null; then
    WILDCARD_DOMAIN=$(jq -r '.domains.wildcard // empty' "$SERVER_CONFIG")
fi

# Fallback to environment variable
WILDCARD_DOMAIN="${WILDCARD_DOMAIN:-$WILDCARD_TLD}"

if [[ -z "$WILDCARD_DOMAIN" ]]; then
    # No wildcard configured, deny all
    exit 1
fi

# Escape dots for regex
ESCAPED_WILDCARD=$(echo "$WILDCARD_DOMAIN" | sed 's/\./\\./g')

if [[ "$DOMAIN" =~ \.${ESCAPED_WILDCARD}$ ]]; then
    exit 0  # Allow
else
    exit 1  # Deny
fi
