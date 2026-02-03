#!/bin/bash
#
# Backup script for /srv/webalive websites
# Pushes all website changes to GitHub repository
#

set -e  # Exit on error

# Configuration
REPO_DIR="/srv/webalive"
SSH_KEY="/root/.ssh/id_lars_deploy_bot"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
MAX_FILES_PER_SITE=200

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Website Backup Script ===${NC}"
echo -e "${BLUE}Timestamp: ${TIMESTAMP}${NC}"
echo ""

# Change to the websites repository
cd "$REPO_DIR"

# Fetch latest changes from remote
echo -e "${BLUE}Fetching latest changes from remote...${NC}"
GIT_SSH_COMMAND="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" git fetch origin main

# Check if local is behind remote
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
    echo -e "${BLUE}Local branch differs from remote. Pulling changes...${NC}"
    GIT_SSH_COMMAND="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" git pull origin main --no-rebase || {
        echo -e "${RED}Failed to pull from remote. Please resolve conflicts manually.${NC}"
        exit 1
    }
fi

# Check if there are any changes (including untracked files)
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${GREEN}No changes detected. Repository is up to date.${NC}"
    exit 0
fi

echo -e "${BLUE}Changes detected. Analyzing sites...${NC}"

# Get list of sites with changes
declare -A site_file_counts
declare -a skipped_sites
declare -a included_sites

# Count files per site
while IFS= read -r line; do
    file=$(echo "$line" | awk '{print $2}')
    status=$(echo "$line" | awk '{print $1}')

    # Extract site name from path
    if [[ "$file" =~ ^sites/([^/]+)/ ]]; then
        site="${BASH_REMATCH[1]}"

        # For deleted files, count as 1
        if [[ "$status" == "D" ]]; then
            ((site_file_counts[$site]++)) || site_file_counts[$site]=1
        # If it's a directory (ends with /), count files inside it (excluding build artifacts)
        elif [[ "$file" == */ ]]; then
            file_count=$(find "${file%/}" -type f \
                -not -path "*/node_modules/*" \
                -not -path "*/.vite/*" \
                -not -path "*/dist/*" \
                -not -path "*/build/*" \
                -not -path "*/.bun/*" \
                2>/dev/null | wc -l)
            ((site_file_counts[$site]+=$file_count)) || site_file_counts[$site]=$file_count
        else
            # Regular file
            ((site_file_counts[$site]++)) || site_file_counts[$site]=1
        fi
    fi
done < <(git status --porcelain)

# Categorize sites
for site in "${!site_file_counts[@]}"; do
    count=${site_file_counts[$site]}
    if [ "$count" -gt "$MAX_FILES_PER_SITE" ]; then
        skipped_sites+=("$site")
        echo -e "${RED}✗ Skipping sites/$site/ ($count files > $MAX_FILES_PER_SITE)${NC}"
    else
        included_sites+=("$site")
        echo -e "${GREEN}✓ Including sites/$site/ ($count files)${NC}"
    fi
done

# Stage files from included sites only
if [ ${#included_sites[@]} -eq 0 ]; then
    echo -e "${RED}No sites to backup after filtering${NC}"
    exit 1
fi

# Stage each included site (exclude build artifacts via pathspec)
for site in "${included_sites[@]}"; do
    # Add all tracked changes for this site
    git add -A "sites/$site/" 2>/dev/null || true
    # Remove build artifacts if they were accidentally added
    git reset "sites/$site/node_modules" "sites/$site/**/.vite" "sites/$site/**/dist" "sites/$site/**/build" "sites/$site/**/.bun" 2>/dev/null || true
done

# Also stage non-site files (storage, gitignore, etc) and handle deletions
git status --porcelain | while read -r line; do
    file=$(echo "$line" | awk '{print $2}')
    # Skip site files already handled above
    if ! echo "$file" | grep -q "^sites/"; then
        if [ -n "$file" ]; then
            git add "$file" 2>/dev/null || true
        fi
    fi
    # Handle deleted files
    if echo "$line" | grep -q "^ D "; then
        git rm "$file" 2>/dev/null || true
    fi
done

# Count staged files
STAGED_COUNT=$(git diff --cached --name-only | wc -l)

if [ "$STAGED_COUNT" -eq 0 ]; then
    echo -e "${RED}No files staged for commit${NC}"
    exit 1
fi

echo -e "${BLUE}Total files to backup: ${STAGED_COUNT}${NC}"

# Create commit with timestamp
COMMIT_MSG="Backup: ${TIMESTAMP}

Automated backup of all websites from /srv/webalive"

if [ ${#skipped_sites[@]} -gt 0 ]; then
    COMMIT_MSG="$COMMIT_MSG

Skipped sites with >${MAX_FILES_PER_SITE} files:"
    for site in "${skipped_sites[@]}"; do
        count=${site_file_counts[$site]}
        COMMIT_MSG="$COMMIT_MSG
  - sites/$site/ ($count files)"
    done
fi

COMMIT_MSG="$COMMIT_MSG

Co-Authored-By: lars-deploy-bot <lars-deploy-bot@hetzner-webalive>"

git commit -m "$COMMIT_MSG"

# Push to GitHub using SSH key
echo -e "${BLUE}Pushing to GitHub...${NC}"
GIT_SSH_COMMAND="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" git push origin main

echo -e "${GREEN}✓ Backup completed successfully!${NC}"
echo -e "${GREEN}✓ ${STAGED_COUNT} files pushed to GitHub${NC}"

if [ ${#skipped_sites[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ ${#skipped_sites[@]} site(s) skipped (too many files)${NC}"
fi
