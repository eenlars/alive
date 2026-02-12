#!/bin/bash

# Stealth Request Service Setup
# Installs Chrome/Chromium for puppeteer-based web scraping with stealth plugin

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔧 Setting up Stealth Request service...${NC}"

# Verify environment
if [ -z "$PUPPETEER_CACHE_DIR" ]; then
  PUPPETEER_CACHE_DIR="${HOME}/.cache/puppeteer"
  echo -e "${YELLOW}⚠️  PUPPETEER_CACHE_DIR not set, using: ${PUPPETEER_CACHE_DIR}${NC}"
else
  echo -e "${GREEN}✓${NC} PUPPETEER_CACHE_DIR=${PUPPETEER_CACHE_DIR}"
fi

# Create cache directory if it doesn't exist
mkdir -p "$PUPPETEER_CACHE_DIR"
echo -e "${GREEN}✓${NC} Cache directory: ${PUPPETEER_CACHE_DIR}"

# Install Chrome via puppeteer
echo -e "${YELLOW}📥 Installing Chrome for puppeteer...${NC}"
export PUPPETEER_CACHE_DIR="$PUPPETEER_CACHE_DIR"
npx puppeteer browsers install chrome 2>&1 | tail -5

# Verify installation
CHROME_PATH=$(ls -d "$PUPPETEER_CACHE_DIR"/chrome/linux-*/chrome-linux*/chrome 2>/dev/null | head -1)
if [ -z "$CHROME_PATH" ]; then
  echo -e "${RED}✗${NC} Chrome installation failed!"
  exit 1
fi

echo -e "${GREEN}✓${NC} Chrome installed at: ${CHROME_PATH}"

# Install npm dependencies
echo -e "${YELLOW}📦 Installing npm dependencies...${NC}"
npm install || bun install

echo -e "${GREEN}✓${NC} Setup complete!"
echo ""
echo -e "${YELLOW}To start the service:${NC}"
echo "  export PUPPETEER_CACHE_DIR=${PUPPETEER_CACHE_DIR}"
echo "  bun apps/mcp/stealth-request/server.ts"
echo ""
echo -e "${YELLOW}Service will listen on: http://0.0.0.0:1234${NC}"
