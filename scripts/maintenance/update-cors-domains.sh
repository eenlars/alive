#!/bin/bash

# Automated CORS Domain Discovery Script
# Scans /root/webalive/sites/ for domains and updates allowed-domains.json

set -e

SITES_DIR="/root/webalive/sites"
ALLOWED_DOMAINS_FILE="/root/alive/allowed-domains.json"

# Read environment configuration
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_CONFIG="$PROJECT_ROOT/packages/shared/environments.json"

PROD_PORT=$(jq -r '.environments.production.port' "$ENV_CONFIG")
STAGING_PORT=$(jq -r '.environments.staging.port' "$ENV_CONFIG")
DEV_PORT=$(jq -r '.environments.dev.port' "$ENV_CONFIG")

echo "🔍 Scanning for domains in $SITES_DIR..."

# Start with base domains
DOMAINS=(
    "https://terminal.goalive.nl"
    "http://localhost:3000"
    "http://localhost:$PROD_PORT"
    "http://localhost:$STAGING_PORT"
    "http://localhost:$DEV_PORT"
    "http://127.0.0.1:3000"
    "http://127.0.0.1:$PROD_PORT"
    "http://127.0.0.1:$STAGING_PORT"
    "http://127.0.0.1:$DEV_PORT"
)

# Scan sites directory for domain names
if [ -d "$SITES_DIR" ]; then
    for site_dir in "$SITES_DIR"/*; do
        if [ -d "$site_dir" ] && [ "$(basename "$site_dir")" != "template" ]; then
            domain=$(basename "$site_dir")
            echo "✅ Found domain: $domain"
            DOMAINS+=("https://$domain")
            DOMAINS+=("http://$domain")
        fi
    done
else
    echo "⚠️  Sites directory not found: $SITES_DIR"
fi

# Generate JSON array
echo "📝 Updating $ALLOWED_DOMAINS_FILE..."
{
    echo "["
    for i in "${!DOMAINS[@]}"; do
        if [ $i -eq $((${#DOMAINS[@]} - 1)) ]; then
            echo "  \"${DOMAINS[$i]}\""
        else
            echo "  \"${DOMAINS[$i]}\","
        fi
    done
    echo "]"
} > "$ALLOWED_DOMAINS_FILE"

echo "🎉 Updated allowed domains:"
cat "$ALLOWED_DOMAINS_FILE"

echo ""
echo "📊 Total domains: ${#DOMAINS[@]}"