#!/bin/bash
set -e

if ! redis-cli PING 2>/dev/null | grep -q PONG; then
    echo "FAIL: Redis is not responding"
    exit 1
fi

echo "OK: Redis is healthy"
echo ""
echo "Stats:"
redis-cli INFO stats 2>/dev/null | grep -E "total_commands_processed|total_connections_received"
redis-cli INFO memory 2>/dev/null | grep used_memory_human | head -1
