#!/bin/bash
# Main orchestrator for all static analysis checks
# IMPORTANT: This is for Makefile use only. Run via: make static-check

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Load configuration
source "$SCRIPT_DIR/config.sh"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cd "$PROJECT_ROOT"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Static Analysis & Validation      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Get enabled checks
ENABLED_CHECKS=()
while IFS= read -r check; do
    ENABLED_CHECKS+=("$check")
done < <(get_enabled_checks)

TOTAL_CHECKS=${#ENABLED_CHECKS[@]}

# Track failures
FAILED_CHECKS=()
CURRENT_CHECK=0

# Run each enabled check
for check in "${ENABLED_CHECKS[@]}"; do
    CURRENT_CHECK=$((CURRENT_CHECK + 1))
    IFS='|' read -r _id description script <<< "$check"

    echo -e "${BLUE}[$CURRENT_CHECK/$TOTAL_CHECKS] $description...${NC}"

    if "$SCRIPT_DIR/$script"; then
        echo ""
    else
        FAILED_CHECKS+=("$description")
        echo ""
    fi
done

# Summary
if [ ${#FAILED_CHECKS[@]} -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║    ✅ All Static Checks Passed!       ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║    ❌ Some Checks Failed               ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}Failed checks:${NC}"
    for check in "${FAILED_CHECKS[@]}"; do
        echo -e "  ${RED}✗${NC} $check"
    done
    exit 1
fi
