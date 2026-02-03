#!/bin/bash
#
# Validation script to detect references to deleted files
# Usage: ./scripts/validate-no-deleted-refs.sh <file1> <file2> ...
#
# Example: ./scripts/validate-no-deleted-refs.sh bridge.config.js environments.json
#
# Exit codes:
#   0 - No references found
#   1 - References found (blocks migration)
#   2 - Invalid usage

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check usage
if [ $# -eq 0 ]; then
  echo -e "${RED}Error: No files specified${NC}"
  echo "Usage: $0 <file1> <file2> ..."
  echo "Example: $0 bridge.config.js environments.json"
  exit 2
fi

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🔍 Validating no references to deleted files..."
echo "📂 Project root: $PROJECT_ROOT"
echo ""

# Exclusions
EXCLUDE_DIRS=(
  "node_modules"
  ".next"
  ".builds"
  ".git"
  "dist"
  "build"
  ".turbo"
  "coverage"
  "test-results"
)

# Build exclusion args for grep
EXCLUDE_ARGS=""
for dir in "${EXCLUDE_DIRS[@]}"; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude-dir=$dir"
done

# Track overall result
FOUND_REFERENCES=false
TOTAL_FILES=0

# Check each file
for FILE in "$@"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Checking references to: ${YELLOW}$FILE${NC}"
  echo ""

  # Search for references (case-insensitive, show filenames only)
  RESULTS=$(grep -r -i "$FILE" . $EXCLUDE_ARGS --exclude="*.md" --exclude="validate-no-deleted-refs.sh" 2>/dev/null || true)

  if [ -n "$RESULTS" ]; then
    FOUND_REFERENCES=true
    ((TOTAL_FILES++))

    echo -e "${RED}✗ Found references:${NC}"
    echo "$RESULTS" | while IFS= read -r line; do
      echo -e "  ${RED}→${NC} $line"
    done
    echo ""

    # Show count
    COUNT=$(echo "$RESULTS" | wc -l)
    echo -e "${RED}Found $COUNT reference(s) to '$FILE'${NC}"
  else
    echo -e "${GREEN}✓ No references found${NC}"
  fi

  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Summary
if [ "$FOUND_REFERENCES" = true ]; then
  echo -e "${RED}❌ VALIDATION FAILED${NC}"
  echo -e "${RED}Found references to $TOTAL_FILES deleted file(s)${NC}"
  echo ""
  echo "Action required:"
  echo "1. Update all references shown above"
  echo "2. Re-run this script to verify"
  echo "3. Only then delete the files"
  echo ""
  echo -e "${YELLOW}Tip: To exclude documentation, the script already excludes *.md files${NC}"
  exit 1
else
  echo -e "${GREEN}✅ VALIDATION PASSED${NC}"
  echo -e "${GREEN}No references found to any specified files${NC}"
  echo ""
  echo "Safe to delete:"
  for FILE in "$@"; do
    echo "  • $FILE"
  done
  exit 0
fi
