#!/bin/bash
# Quick deployment script - use this for regular deployments

set -e

ENV="${1:-staging}"

if [ "$ENV" != "staging" ] && [ "$ENV" != "production" ]; then
  echo "Usage: $0 [staging|production]"
  exit 1
fi

echo ""
echo "════════════════════════════════════════"
echo "  🚀 Claude Bridge Deployment"
echo "════════════════════════════════════════"
echo ""
echo "Environment: $ENV"
echo ""

# Run safe deployment
exec /usr/local/bin/safe-deploy.sh "$ENV"
