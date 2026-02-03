#!/bin/bash
# Fix systemd global PORT pollution
# See: docs/open-problems/deployment-port-collision.md

set -e

echo "🔍 Checking for global PORT in systemd environment..."
CURRENT_PORT=$(systemctl show-environment | grep "^PORT=" || echo "")

if [ -z "$CURRENT_PORT" ]; then
    echo "✅ No global PORT variable found. Environment is clean."
    exit 0
fi

echo "⚠️  Found global PORT in systemd: $CURRENT_PORT"
echo "   This affects ALL systemd services and causes deployment failures."
echo ""
read -p "Remove global PORT from systemd? (y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Removing global PORT from systemd..."
    systemctl unset-environment PORT

    echo "✅ Global PORT removed successfully!"
    echo ""
    echo "Verifying..."
    systemctl show-environment | grep PORT || echo "✅ Confirmed: No PORT in environment"
    echo ""
    echo "📝 Note: Existing services will keep their PORT from env files."
    echo "   New deployments will now use correct per-service PORT values."
else
    echo "❌ Aborted. No changes made."
    exit 1
fi
