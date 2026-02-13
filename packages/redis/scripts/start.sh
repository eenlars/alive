#!/bin/bash
set -e

if systemctl is-active --quiet redis-server; then
    echo "Redis is already running"
    exit 0
fi

echo "Starting Redis..."
systemctl start redis-server

if redis-cli PING 2>/dev/null | grep -q PONG; then
    echo "OK: Redis is ready on 127.0.0.1:6379"
else
    echo "FAIL: Redis did not respond after start"
    exit 1
fi
