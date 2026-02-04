#!/bin/bash
# Check that no .env files are staged or tracked in git
# Prevents accidental exposure of secrets

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cd "$PROJECT_ROOT"

# Find .env files that are:
# 1. Staged for commit (git diff --cached)
# 2. Already tracked by git (git ls-files)
#
# Exclude safe files:
# - .env.example (template files)
# - .env.*.example (template files)

FOUND_FILES=()

# Check staged files
while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    # Skip example files
    [[ "$file" == *.example ]] && continue
    FOUND_FILES+=("$file (staged)")
done < <(git diff --cached --name-only 2>/dev/null | grep -E '\.env($|\.)' || true)

# Check tracked files (already in repo)
while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    # Skip example files
    [[ "$file" == *.example ]] && continue
    FOUND_FILES+=("$file (tracked)")
done < <(git ls-files 2>/dev/null | grep -E '\.env($|\.)' || true)

# Report findings
if [ ${#FOUND_FILES[@]} -gt 0 ]; then
    echo -e "${RED}SECURITY: Found .env files in git!${NC}"
    echo -e "${RED}These files likely contain secrets and must not be committed.${NC}"
    echo ""
    for file in "${FOUND_FILES[@]}"; do
        echo -e "  ${RED}✗${NC} $file"
    done
    echo ""
    echo -e "${RED}To fix:${NC}"
    echo "  1. Remove from staging: git reset HEAD <file>"
    echo "  2. Remove from repo: git rm --cached <file>"
    echo "  3. Add to .gitignore if missing"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ No .env files found in git${NC}"
exit 0
