#!/bin/bash
set -e

echo "Checking Redis installation..."

if command -v redis-server &> /dev/null; then
    VERSION=$(redis-server --version | head -1)
    echo "OK: $VERSION"
else
    echo "FAIL: redis-server not found"
    echo "Install: apt install redis-server"
    exit 1
fi

if command -v redis-cli &> /dev/null; then
    echo "OK: redis-cli available"
else
    echo "FAIL: redis-cli not found"
    exit 1
fi

echo ""
echo "Connection: redis://127.0.0.1:6379"
