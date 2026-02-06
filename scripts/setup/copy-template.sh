#!/usr/bin/env bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
FORCE=false
if [ "$1" = "--force" ] || [ "$1" = "-f" ]; then
    FORCE=true
fi

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ALIVE_DIR="$PROJECT_ROOT/.alive"
TEMPLATE_DIR="$ALIVE_DIR/template"
SOURCE_TEMPLATE="$PROJECT_ROOT/templates/site-template/user"
ENV_FILE="$PROJECT_ROOT/apps/web/.env.local"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Claude Bridge - Local Development Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Verify we're in the right directory (check for package.json with correct name)
if [ ! -f "$PROJECT_ROOT/package.json" ]; then
    echo -e "${RED}✗ Error: Not in a valid project directory${NC}"
    echo -e "  package.json not found at: $PROJECT_ROOT"
    exit 1
fi

if ! grep -q '"name": "claude-bridge-mono"' "$PROJECT_ROOT/package.json" 2>/dev/null; then
    echo -e "${YELLOW}⚠ Warning: This doesn't appear to be the claude-bridge-mono project${NC}"
    echo -e "  Continuing anyway..."
    echo ""
fi

# Check if source template exists and is a directory
if [ ! -e "$SOURCE_TEMPLATE" ]; then
    echo -e "${RED}✗ Error: Source template not found${NC}"
    echo -e "  Expected location: $SOURCE_TEMPLATE"
    echo -e "  This likely means the monorepo structure is incorrect."
    exit 1
fi

if [ ! -d "$SOURCE_TEMPLATE" ]; then
    echo -e "${RED}✗ Error: Source template exists but is not a directory${NC}"
    echo -e "  Path: $SOURCE_TEMPLATE"
    echo -e "  Please check your repository structure."
    exit 1
fi

# Check if source template is empty
if [ -z "$(ls -A "$SOURCE_TEMPLATE" 2>/dev/null)" ]; then
    echo -e "${RED}✗ Error: Source template directory is empty${NC}"
    echo -e "  Path: $SOURCE_TEMPLATE"
    echo -e "  The template must contain files to copy."
    exit 1
fi

# Check if source template is readable
if [ ! -r "$SOURCE_TEMPLATE" ]; then
    echo -e "${RED}✗ Error: Source template is not readable${NC}"
    echo -e "  Path: $SOURCE_TEMPLATE"
    echo -e "  Check file permissions."
    exit 1
fi

echo -e "${GREEN}✓${NC} Source template validated: $SOURCE_TEMPLATE"

# Check if .alive exists and handle edge cases
if [ -e "$ALIVE_DIR" ] && [ ! -d "$ALIVE_DIR" ]; then
    echo -e "${RED}✗ Error: .alive exists but is not a directory${NC}"
    echo -e "  Path: $ALIVE_DIR"
    echo -e "  Please remove this file manually: ${BLUE}rm $ALIVE_DIR${NC}"
    exit 1
fi

# Create .alive directory if it doesn't exist
if [ ! -d "$ALIVE_DIR" ]; then
    echo -e "${GREEN}✓${NC} Creating .alive directory..."
    if ! mkdir -p "$ALIVE_DIR" 2>/dev/null; then
        echo -e "${RED}✗ Error: Failed to create .alive directory${NC}"
        echo -e "  Check write permissions in: $PROJECT_ROOT"
        exit 1
    fi
else
    echo -e "${GREEN}✓${NC} .alive directory already exists"
fi

# Check if template exists but is a file (not directory)
if [ -e "$TEMPLATE_DIR" ] && [ ! -d "$TEMPLATE_DIR" ]; then
    echo -e "${RED}✗ Error: .alive/template exists but is not a directory${NC}"
    echo -e "  Path: $TEMPLATE_DIR"
    echo -e "  Remove it manually: ${BLUE}rm $TEMPLATE_DIR${NC}"
    exit 1
fi

# Handle existing template
if [ -d "$TEMPLATE_DIR" ]; then
    # Check if template is empty
    if [ -z "$(ls -A "$TEMPLATE_DIR" 2>/dev/null)" ]; then
        echo -e "${YELLOW}⚠${NC} Template directory exists but is empty (will be repopulated)"
        rm -rf "$TEMPLATE_DIR"
        FORCE=true
    elif [ "$FORCE" = true ]; then
        echo -e "${YELLOW}⚠${NC} Force mode: Removing existing template..."
        rm -rf "$TEMPLATE_DIR"
    else
        echo -e "${YELLOW}⚠${NC} Template already exists at .alive/template (skipping copy)"
        echo -e "  To reset your workspace, run: ${BLUE}bun run setup --force${NC}"
        echo -e "  Or manually: ${BLUE}rm -rf $TEMPLATE_DIR && bun run setup${NC}"
        SKIP_COPY=true
    fi
fi

# Copy template
if [ "$SKIP_COPY" != true ]; then
    echo -e "${GREEN}✓${NC} Copying template to .alive/template..."

    if ! cp -r "$SOURCE_TEMPLATE" "$TEMPLATE_DIR" 2>/dev/null; then
        echo -e "${RED}✗ Error: Failed to copy template${NC}"
        echo -e "  Source: $SOURCE_TEMPLATE"
        echo -e "  Destination: $TEMPLATE_DIR"
        echo -e "  Check disk space and permissions."
        exit 1
    fi

    # Verify copy was successful
    if [ ! -d "$TEMPLATE_DIR" ] || [ -z "$(ls -A "$TEMPLATE_DIR" 2>/dev/null)" ]; then
        echo -e "${RED}✗ Error: Template copy verification failed${NC}"
        echo -e "  The template directory is missing or empty after copy."
        exit 1
    fi

    echo -e "${GREEN}✓${NC} Template copied successfully"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Installing git hooks...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
"$SCRIPT_DIR/install-git-hooks.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Setup complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check .env.local and offer to update it
ENV_NEEDS_UPDATE=false
if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}✓${NC} Found existing .env.local"

    # Check if STREAM_ENV is set correctly
    if ! grep -q "^STREAM_ENV=local" "$ENV_FILE" 2>/dev/null; then
        echo -e "${YELLOW}⚠${NC} STREAM_ENV not set to 'local' in .env.local"
        ENV_NEEDS_UPDATE=true
    fi

    # Check if LOCAL_TEMPLATE_PATH is set correctly
    if ! grep -q "^LOCAL_TEMPLATE_PATH=$TEMPLATE_DIR" "$ENV_FILE" 2>/dev/null; then
        echo -e "${YELLOW}⚠${NC} LOCAL_TEMPLATE_PATH not set correctly in .env.local"
        ENV_NEEDS_UPDATE=true
    fi

    if [ "$ENV_NEEDS_UPDATE" = true ]; then
        echo ""
        echo -e "${BLUE}→${NC} Update your ${BLUE}apps/web/.env.local${NC} with:"
        echo -e ""
        echo -e "     ${GREEN}STREAM_ENV=local${NC}"
        echo -e "     ${GREEN}LOCAL_TEMPLATE_PATH=$TEMPLATE_DIR${NC}"
        echo ""
    else
        echo -e "${GREEN}✓${NC} .env.local is configured correctly"
        echo ""
    fi
else
    echo -e "${YELLOW}⚠${NC} .env.local not found"
    echo ""
    echo -e "${BLUE}→${NC} Create ${BLUE}apps/web/.env.local${NC} with:"
    echo -e ""
    echo -e "     ${GREEN}STREAM_ENV=local${NC}"
    echo -e "     ${GREEN}LOCAL_TEMPLATE_PATH=$TEMPLATE_DIR${NC}"
    echo ""
fi

if [ "$ENV_NEEDS_UPDATE" = false ] && [ -f "$ENV_FILE" ]; then
    echo -e "Next steps:"
    echo -e "  1. Start the development server:"
    echo -e "     ${BLUE}bun run web${NC}"
    echo -e ""
    echo -e "  2. Log in with test credentials:"
    echo -e "     Workspace: ${GREEN}test${NC}"
    echo -e "     Passcode:  ${GREEN}test${NC}"
else
    echo -e "Next steps:"
    echo -e "  1. Configure your environment (see above)"
    echo -e ""
    echo -e "  2. Start the development server:"
    echo -e "     ${BLUE}bun run web${NC}"
    echo -e ""
    echo -e "  3. Log in with test credentials:"
    echo -e "     Workspace: ${GREEN}test${NC}"
    echo -e "     Passcode:  ${GREEN}test${NC}"
fi

echo -e ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "For detailed documentation, see: ${BLUE}docs/setup/README.md${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
