#!/bin/bash

# Setup script for GitHub webhook auto-deployment

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}GitHub Webhook Auto-Deployment Setup${NC}"
echo "========================================"
echo ""

# Generate webhook secret if not exists
ENV_FILE="apps/web/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    touch "$ENV_FILE"
fi

# Check if secret already exists
if grep -q "GITHUB_WEBHOOK_SECRET=" "$ENV_FILE"; then
    echo -e "${GREEN}✓ GITHUB_WEBHOOK_SECRET already configured${NC}"
    WEBHOOK_SECRET=$(grep "GITHUB_WEBHOOK_SECRET=" "$ENV_FILE" | cut -d'=' -f2)
else
    echo -e "${YELLOW}Generating new webhook secret...${NC}"
    WEBHOOK_SECRET=$(openssl rand -hex 32)
    echo "GITHUB_WEBHOOK_SECRET=$WEBHOOK_SECRET" >> "$ENV_FILE"
    echo -e "${GREEN}✓ Secret generated and saved to .env${NC}"
fi

# Check deploy branch
if grep -q "DEPLOY_BRANCH=" "$ENV_FILE"; then
    DEPLOY_BRANCH=$(grep "DEPLOY_BRANCH=" "$ENV_FILE" | cut -d'=' -f2)
else
    DEPLOY_BRANCH="main"
    echo "DEPLOY_BRANCH=$DEPLOY_BRANCH" >> "$ENV_FILE"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              GitHub Webhook Configuration                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "1️⃣  Go to your GitHub repository"
echo "   → Settings → Webhooks → Add webhook"
echo ""
echo "2️⃣  Configure webhook:"
echo "   Payload URL:     https://your-domain.com/api/webhook/deploy"
echo "   Content type:    application/json"
echo "   Secret:          $WEBHOOK_SECRET"
echo ""
echo "3️⃣  Which events?"
echo "   ☑ Just the push event"
echo ""
echo "4️⃣  Save and test!"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}Configuration:${NC}"
echo "  Deploy branch:   $DEPLOY_BRANCH"
echo "  Webhook URL:     /api/webhook/deploy"
echo "  Logs directory:  logs/"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Rebuild and deploy to staging: make staging"
echo "  2. Configure GitHub webhook (see above)"
echo "  3. Push to $DEPLOY_BRANCH to trigger auto-deployment"
echo "  4. Contact devops for production deployment"
echo ""
echo "═══════════════════════════════════════════════════════════"
