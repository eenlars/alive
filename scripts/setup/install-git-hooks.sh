#!/bin/bash
# Install git hooks for the project
# Run this after cloning the repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

echo "📦 Installing git hooks..."

# Resolve the actual git directory (handles worktrees where .git is a file)
GIT_DIR="$(git rev-parse --git-dir)"
HOOKS_DIR="$GIT_DIR/hooks"
mkdir -p "$HOOKS_DIR"

# Install pre-push hook
cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/bin/sh
# Pre-push hook: Run static checks before pushing
# This prevents pushing code with lint/type/dead code issues

echo "🔍 Running static checks before push..."
make static-check

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Pre-push check failed. Fix the issues above before pushing."
    echo "   To skip this check (not recommended): git push --no-verify"
    exit 1
fi

echo "✅ All checks passed. Proceeding with push..."
EOF

chmod +x "$HOOKS_DIR/pre-push"

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-push hook will run 'make static-check' before every push."
echo "To skip the hook, use: git push --no-verify"
