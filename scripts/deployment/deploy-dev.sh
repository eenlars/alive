#!/bin/bash
set -e

# Development environment deployment (hot-reload mode)
# Rebuilds packages + restarts dev server

SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_CONFIG="$PROJECT_ROOT/packages/shared/environments.json"

# Auto-detect environment if not set
if [ -z "$HOSTED_ENV" ]; then
    # Check if systemd is available and alive services exist
    if systemctl list-unit-files claude-bridge-dev.service &> /dev/null; then
        HOSTED_ENV="server"
        echo "🔍 Auto-detected: server environment (systemd services available)"
    else
        HOSTED_ENV="computer"
        echo "🔍 Auto-detected: computer environment (no systemd services)"
    fi
fi

# Validate HOSTED_ENV value
if [ "$HOSTED_ENV" != "server" ] && [ "$HOSTED_ENV" != "computer" ]; then
    echo "❌ Error: HOSTED_ENV must be either 'server' or 'computer'"
    echo "   Current value: '$HOSTED_ENV'"
    exit 1
fi

# If running on computer (local dev), use simple workflow
if [ "$HOSTED_ENV" = "computer" ]; then
    echo "💻 Computer environment detected (HOSTED_ENV=computer)"
    echo "🔄 Building packages and starting dev server..."

    make static-check
    echo "✅ Static checks complete"

    # Clean Next.js build cache
    echo "🧹 Cleaning Next.js build cache..."
    rm -rf "$PROJECT_ROOT/apps/web/.next"
    echo "✅ Build cache cleaned"

    # Start dev server
    echo "🚀 Starting Next.js dev server..."
    cd "$PROJECT_ROOT/apps/web"
    exec bun run dev
fi

# Server environment - proceed with systemd deployment
echo "🖥️  Server environment detected (HOSTED_ENV=server)"

# Systemd service name for dev
DEV_SERVICE="claude-bridge-dev"
DEV_PORT=8997

echo "🔄 Rebuilding packages and restarting dev environment..."

make static-check
echo "✅ Static checks complete"

cd packages/images && bun run build && cd ../..
echo "✅ Images built"

cd packages/tools && bun run build && cd ../..
echo "✅ Tools built"

# Stop systemd service before cleaning (prevents race condition with corrupted cache)
echo "🛑 Stopping dev server..."
systemctl stop "$DEV_SERVICE" 2>/dev/null || echo "  (service not running)"

# Kill any stale process on the port (in case another process is holding it)
if fuser "$DEV_PORT/tcp" >/dev/null 2>&1; then
    echo "⚠️  Port $DEV_PORT still in use, killing stale process..."
    fuser -k "$DEV_PORT/tcp" 2>/dev/null || true
    sleep 1
fi

# Clean Next.js build cache to prevent corrupted manifest issues
echo "🧹 Cleaning Next.js build cache..."
rm -rf apps/web/.next
echo "✅ Build cache cleaned"

# Start fresh
echo "🚀 Starting dev server on port $DEV_PORT..."
systemctl start "$DEV_SERVICE"
echo "✅ Dev server started"

# Wait for server to initialize
sleep 5

echo "🔐 Verifying dev server is responding..."
curl -f -s "http://localhost:$DEV_PORT/api/health" > /dev/null 2>&1 && \
  echo "✅ Dev server health check passed (API responding)" || \
  echo "⚠️  Dev server health check failed (API not responding)"

systemctl status "$DEV_SERVICE" --no-pager | head -15

# Rebuild and restart shell-server-go (shared across all environments)
echo ""
echo "📡 Rebuilding shell-server-go..."
cd apps/shell-server-go
if bun run build; then
    echo "✅ Shell-server built"
    systemctl restart shell-server-go
    sleep 2
    systemctl is-active --quiet shell-server-go && \
      echo "✅ Shell-server restarted" || \
      echo "⚠️  Shell-server failed to start (check: journalctl -u shell-server-go -n 20)"
else
    echo "⚠️  Shell-server build failed"
fi
cd ../..
