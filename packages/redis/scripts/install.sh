#!/bin/bash
set -e

echo "🚀 Installing Redis for development..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install it first."
    exit 1
fi


# Pull Redis image
echo "📦 Pulling Redis image..."
docker-compose pull redis

echo "✅ Redis installation complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'bun --filter @webalive/redis start' to start Redis"
echo "  2. Run 'bun --filter @webalive/redis health' to check status"
echo ""
echo "Connection string: redis://127.0.0.1:6379"
