#!/bin/bash
# Install git hooks for the project
# Run this after cloning the repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

# Husky manages hooks via core.hooksPath — skip manual install
HOOKS_PATH="$(git config core.hooksPath 2>/dev/null || true)"
if [ -n "$HOOKS_PATH" ]; then
    echo "✅ Git hooks managed by Husky (core.hooksPath=$HOOKS_PATH)"
    exit 0
fi

echo "📦 Installing git hooks (no Husky detected)..."

# Resolve the common git directory (shared across worktrees)
GIT_DIR="$(git rev-parse --git-common-dir)"
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
