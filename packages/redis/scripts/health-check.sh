#!/bin/bash
set -e

echo "🏥 Checking Redis health..."

# Check if container is running
if ! docker ps | grep -q "redis"; then
    echo "❌ Redis container is not running"
    exit 1
fi

# Check if Redis responds to PING (with authentication)
if docker exec redis redis-cli -a dev_password_only ping &> /dev/null; then
    echo "✅ Redis is healthy"

    # Show stats
    echo ""
    echo "📊 Redis Stats:"
    docker exec redis redis-cli -a dev_password_only INFO stats 2>/dev/null | grep -E "total_commands_processed|total_connections_received|used_memory_human"

    exit 0
else
    echo "❌ Redis is not responding"
    exit 1
fi
