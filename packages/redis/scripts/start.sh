#!/bin/bash
set -e

echo "🚀 Starting Redis..."

# Check if Redis is already running
if docker ps | grep -q "redis"; then
    echo "⚠️  Redis is already running"
    docker-compose ps redis
    exit 0
fi

# Start Redis
docker-compose up -d redis

# Wait for Redis to be healthy
echo "⏳ Waiting for Redis to be ready..."
timeout=30
elapsed=0

while [ $elapsed -lt $timeout ]; do
    if docker exec redis redis-cli ping &> /dev/null; then
        echo "✅ Redis is ready!"
        echo ""
        echo "Connection details:"
        echo "  - Host (from host): 127.0.0.1:6379"
        echo "  - Host (from Docker): redis:6379"
        echo "  - URL: redis://127.0.0.1:6379"
        echo ""
        echo "Quick commands:"
        echo "  - Status: bun --filter @alive-brug/redis status"
        echo "  - Logs:   bun --filter @alive-brug/redis logs"
        echo "  - CLI:    bun --filter @alive-brug/redis cli"
        exit 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
done

echo "❌ Redis failed to start within ${timeout}s"
echo "Check logs with: bun --filter @alive-brug/redis logs"
exit 1
