#!/usr/bin/env bash
#
# Setup script for Claude Bridge standalone mode
# Run this to configure your local development environment without external dependencies
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Claude Bridge Standalone Setup ===${NC}"
echo ""

# Get home directory
HOME_DIR="${HOME:-$(eval echo ~)}"
STANDALONE_DIR="$HOME_DIR/.claude-bridge"
WORKSPACES_DIR="$STANDALONE_DIR/workspaces"

# Create directories
echo -e "${YELLOW}Creating standalone directories...${NC}"
mkdir -p "$WORKSPACES_DIR/default/user"
echo -e "  ${GREEN}Created:${NC} $WORKSPACES_DIR/default/user"

# Detect script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Create .env.local for apps/web
ENV_FILE="$PROJECT_ROOT/apps/web/.env.local"

if [ -f "$ENV_FILE" ]; then
  echo ""
  echo -e "${YELLOW}Warning:${NC} $ENV_FILE already exists."
  echo -e "Do you want to overwrite it? (y/N) "
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Keeping existing .env.local${NC}"
    echo ""
  else
    # Continue to overwrite
    :
  fi
else
  response="y"
fi

if [[ "$response" =~ ^[Yy]$ ]] || [ ! -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}Creating .env.local...${NC}"
  cat > "$ENV_FILE" << 'ENVEOF'
# Claude Bridge Standalone Mode
# No external dependencies required (except Anthropic API key)

BRIDGE_ENV=standalone
WORKSPACE_BASE=~/.claude-bridge/workspaces

# REQUIRED: Add your Anthropic API key
ANTHROPIC_API_KEY=your-api-key-here

# Dummy values to pass schema validation (not used in standalone mode)
SUPABASE_URL=https://placeholder.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder
ENVEOF
  echo -e "  ${GREEN}Created:${NC} $ENV_FILE"
fi

# Summary
echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo -e "  1. ${YELLOW}Add your Anthropic API key${NC} to:"
echo -e "     $ENV_FILE"
echo ""
echo -e "  2. ${YELLOW}Start the development server:${NC}"
echo -e "     bun run dev"
echo ""
echo -e "  3. ${YELLOW}Open the app:${NC}"
echo -e "     http://localhost:3000"
echo ""
echo -e "  4. ${YELLOW}Login with any email/password${NC} (auto-authenticated)"
echo ""
echo -e "${BLUE}Workspace locations:${NC}"
echo -e "  Base directory: $WORKSPACES_DIR"
echo -e "  Default workspace: $WORKSPACES_DIR/default/user"
echo ""
echo -e "${BLUE}To create more workspaces:${NC}"
echo -e "  mkdir -p $WORKSPACES_DIR/my-project/user"
echo ""
echo -e "${BLUE}Limitations in standalone mode:${NC}"
echo -e "  - Single user only (no authentication)"
echo -e "  - No conversation history persistence (in-memory)"
echo -e "  - No OAuth integrations (Linear, Stripe, etc.)"
echo -e "  - No site deployment (systemd, Caddy)"
echo ""
