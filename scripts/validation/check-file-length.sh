#!/bin/bash
# Check for files that exceed maximum line limits
# Helps maintain readable, focused files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Thresholds
WARN_THRESHOLD=400
ERROR_THRESHOLD=600

# Colors
YELLOW='\033[0;33m'
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cd "$PROJECT_ROOT"

# Find source files, excluding non-source directories and files
FILES=$(find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/.next/*" \
    ! -path "*/.next-test/*" \
    ! -path "*/dist/*" \
    ! -path "*/.builds/*" \
    ! -path "*/build/*" \
    ! -path "*/.bun/*" \
    ! -path "*/.tmp/*" \
    ! -path "*/vendor/*" \
    ! -path "*/*.min.js" \
    ! -path "*/*.bundle.js" \
    ! -path "*/*.generated.*" \
    ! -path "*/*.types.ts" \
    2>/dev/null | sort)

WARNINGS=()
ERRORS=()

for file in $FILES; do
    lines=$(wc -l < "$file" | tr -d ' ')

    if [ "$lines" -gt "$ERROR_THRESHOLD" ]; then
        ERRORS+=("$file ($lines lines)")
    elif [ "$lines" -gt "$WARN_THRESHOLD" ]; then
        WARNINGS+=("$file ($lines lines)")
    fi
done

# Report warnings
if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Files exceeding $WARN_THRESHOLD lines (consider splitting):${NC}"
    for warning in "${WARNINGS[@]}"; do
        echo -e "  ${YELLOW}⚠${NC} $warning"
    done
    echo ""
fi

# Report errors
if [ ${#ERRORS[@]} -gt 0 ]; then
    echo -e "${RED}Files exceeding $ERROR_THRESHOLD lines (should be split):${NC}"
    for error in "${ERRORS[@]}"; do
        echo -e "  ${RED}✗${NC} $error"
    done
    echo ""
fi

if [ ${#WARNINGS[@]} -eq 0 ] && [ ${#ERRORS[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ All files within line limits${NC}"
else
    echo -e "${YELLOW}Note: File length check is advisory (not blocking builds yet)${NC}"
fi

# Exit 0 for now - change to "exit 1" when ready to enforce
exit 0
