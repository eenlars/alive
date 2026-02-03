#!/bin/bash
# Update @alive-game/alive-tagger to latest version across all sites
# Usage: ./update-alive-tagger.sh [version]

VERSION="${1:-latest}"
SITES_DIR="/srv/webalive/sites"

echo "Updating @alive-game/alive-tagger to $VERSION across all sites..."
echo ""

# Get list of actual site directories (exclude duplicates like site-name and site-name/)
sites=$(ls -d "$SITES_DIR"/*/ 2>/dev/null | xargs -n1 basename | grep -E '\.' | sort -u)

updated=0
failed=0
skipped=0

for site in $sites; do
    site_path="$SITES_DIR/$site"
    user_pkg="$site_path/user/package.json"
    root_pkg="$site_path/package.json"

    # Check if site has alive-tagger dependency
    pkg_path=""
    if [ -f "$user_pkg" ] && grep -q "alive-tagger" "$user_pkg" 2>/dev/null; then
        pkg_path="$site_path/user"
    elif [ -f "$root_pkg" ] && grep -q "alive-tagger" "$root_pkg" 2>/dev/null; then
        pkg_path="$site_path"
    fi

    if [ -z "$pkg_path" ]; then
        echo "⏭️  $site - no alive-tagger dependency"
        ((skipped++))
        continue
    fi

    # Get the site user
    site_slug=$(echo "$site" | sed 's/\./-/g')
    site_user="site-$site_slug"

    # Check if user exists
    if ! id "$site_user" &>/dev/null; then
        echo "⚠️  $site - user $site_user not found, skipping"
        ((skipped++))
        continue
    fi

    echo -n "📦 $site - updating... "

    # Update package.json directly with sed (handles both deps and devDeps)
    pkg_file="$pkg_path/package.json"
    if sed -i 's/"@alive-game\/alive-tagger": "[^"]*"/"@alive-game\/alive-tagger": "'"$VERSION"'"/g' "$pkg_file" 2>/dev/null; then
        # Run bun install as the site user to update lockfile
        if sudo -u "$site_user" bash -c "cd '$pkg_path' && bun install" &>/dev/null; then
            echo "✓"
            ((updated++))
        else
            echo "✓ (pkg updated, install failed)"
            ((updated++))
        fi
    else
        echo "✗ (failed)"
        ((failed++))
    fi
done

echo ""
echo "Done! Updated: $updated, Failed: $failed, Skipped: $skipped"
