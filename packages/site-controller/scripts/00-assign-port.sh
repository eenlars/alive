#!/bin/bash
set -e

# Source common functions
source "$(dirname "$0")/lib/common.sh"

# Validate required environment variables
require_var SITE_DOMAIN DATABASE_URL DATABASE_PASSWORD

# Cleanup function to ensure lock is always released
cleanup() {
    flock -u 200 2>/dev/null || true
}
trap cleanup EXIT ERR INT TERM

log_info "Assigning port for domain: $SITE_DOMAIN"

# Load server ID from server-config.json
SERVER_CONFIG="/var/lib/claude-bridge/server-config.json"
if [[ -f "$SERVER_CONFIG" ]]; then
    SERVER_ID=$(jq -r '.serverId // empty' "$SERVER_CONFIG")
    if [[ -n "$SERVER_ID" ]]; then
        log_info "Server ID: $SERVER_ID"
    else
        die "server-config.json exists but serverId is not set"
    fi
else
    die "server-config.json not found at $SERVER_CONFIG - required for multi-server port isolation"
fi

# Extract database host from DATABASE_URL (format: postgresql://user@host:port/database)
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@([^:]+):.*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@[^:]+:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@[^:]+:[0-9]+/(.*)|\1|')
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|postgresql://([^@]+)@.*|\1|')

# Helper function to run SQL queries
db_query() {
    PGPASSWORD="$DATABASE_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null
}

# 🔒 CRITICAL: Acquire lock BEFORE reading to prevent race condition
# This ensures atomic read-modify-write transaction across concurrent deployments
LOCK_FILE="/tmp/port-assignment.lock"
log_info "Acquiring port assignment lock..."
exec 200>"$LOCK_FILE"
if ! flock -w 30 200; then
    die "Failed to acquire port assignment lock after 30 seconds (another deployment in progress)"
fi

log_info "Lock acquired, checking port assignment..."

# Check if domain already has a port in Supabase (on this server)
EXISTING_PORT=$(db_query "SELECT port FROM app.domains WHERE hostname = '$SITE_DOMAIN' AND server_id = '$SERVER_ID'" || echo "")

if [[ -n "$EXISTING_PORT" && "$EXISTING_PORT" =~ ^[0-9]+$ ]]; then
    # Verify the existing port is still available on the system
    if port_in_use "$EXISTING_PORT"; then
        log_warn "Existing port $EXISTING_PORT is now occupied, need to reassign..."
        # Port is occupied by something else, need to find a new one
        EXISTING_PORT=""
    else
        log_success "Domain already has assigned port in database: $EXISTING_PORT"
        flock -u 200  # Release lock before exit
        echo "$EXISTING_PORT"
        exit 0
    fi
fi

# Find the maximum port currently in use from Supabase for THIS SERVER (in range 3333-3999)
log_info "Finding next available port from database for server $SERVER_ID..."
MAX_PORT=$(db_query "SELECT COALESCE(MAX(port), 3332) FROM app.domains WHERE port >= 3333 AND port <= 3999 AND server_id = '$SERVER_ID'" || echo "")

if [[ -z "$MAX_PORT" || ! "$MAX_PORT" =~ ^[0-9]+$ ]]; then
    log_warn "Could not query max port from database, starting from 3333"
    MAX_PORT=3332
fi

NEXT_PORT=$((MAX_PORT + 1))

# Ensure we're within range
if [[ $NEXT_PORT -gt 3999 ]]; then
    die "No available ports in range 3333-3999"
fi

# Double-check port is not in use on system
attempts=0
while true; do
    if ! port_in_use "$NEXT_PORT"; then
        break  # Port is free, use it
    fi

    log_warn "Port $NEXT_PORT is occupied on system, trying next..."
    NEXT_PORT=$((NEXT_PORT + 1))
    attempts=$((attempts + 1))

    # Safety checks
    if [[ $NEXT_PORT -gt 3999 ]]; then
        die "No available ports in range 3333-3999"
    fi

    if [[ $attempts -gt 100 ]]; then
        die "Failed to find available port after 100 attempts"
    fi
done

log_info "Assigning port: $NEXT_PORT"

# Also update legacy JSON registry for backwards compatibility with API reads
# (This can be removed once API reads port from deploy result instead of JSON)
if [[ -n "${REGISTRY_PATH:-}" ]]; then
    if [[ ! -f "$REGISTRY_PATH" ]]; then
        mkdir -p "$(dirname "$REGISTRY_PATH")"
        echo '{}' > "$REGISTRY_PATH"
    fi
    TMP_FILE="${REGISTRY_PATH}.tmp.$$"
    jq --arg domain "$SITE_DOMAIN" --argjson port "$NEXT_PORT" \
        '.[$domain].port = $port' "$REGISTRY_PATH" > "$TMP_FILE"
    mv "$TMP_FILE" "$REGISTRY_PATH"
    log_info "Updated legacy registry: $REGISTRY_PATH"
fi

log_success "Port assigned: $NEXT_PORT"

# Release lock after successful assignment
flock -u 200

echo "$NEXT_PORT"
exit 0
