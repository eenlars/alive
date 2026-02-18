#!/usr/bin/env bash
set -euo pipefail

# Verify bun is installed (fail fast)
command -v bun >/dev/null 2>&1 || {
    echo "Error: bun is not installed"
    echo "Install from: https://bun.sh"
    exit 1
}

# Verify CONDUCTOR_ROOT_PATH is set
if [ -z "${CONDUCTOR_ROOT_PATH:-}" ]; then
    echo "Error: CONDUCTOR_ROOT_PATH environment variable not set"
    echo "This script must be run by Conductor"
    exit 1
fi

# Verify base repo exists
if [ ! -d "$CONDUCTOR_ROOT_PATH" ]; then
    echo "Error: Base repository not found at $CONDUCTOR_ROOT_PATH"
    exit 1
fi

echo "Setting up workspace..."

# Install dependencies
bun install || {
    echo "Error: Failed to install dependencies"
    exit 1
}

# Run project setup (creates .alive/template directory)
bun run setup || {
    echo "Error: Project setup failed"
    exit 1
}

# Copy and configure .env.local
ENV_SOURCE="$CONDUCTOR_ROOT_PATH/apps/web/.env.local"
ENV_DEST="./apps/web/.env.local"
TEMPLATE_PATH="$(pwd)/.alive/template"

if [ ! -f "$ENV_SOURCE" ]; then
    cat <<EOF
Error: No .env.local found in base repository

Create $ENV_SOURCE with required variables:
  ANTHROPIC_API_KEY=your_api_key

Optional for local dev mode:
  STREAM_ENV=local
  LOCAL_TEMPLATE_PATH=<auto-set-per-workspace>
  ALIVE_PASSCODE=your_passcode
  CLAUDE_MODEL=claude-sonnet-4-6
EOF
    exit 1
fi

# Copy env file
cp "$ENV_SOURCE" "$ENV_DEST" || {
    echo "Error: Failed to copy .env.local"
    exit 1
}

# If running in local mode, update LOCAL_TEMPLATE_PATH to workspace-specific path
if grep -q "^STREAM_ENV=local" "$ENV_DEST"; then
    if grep -q "^LOCAL_TEMPLATE_PATH=" "$ENV_DEST"; then
        sed -i.bak "s|^LOCAL_TEMPLATE_PATH=.*|LOCAL_TEMPLATE_PATH=$TEMPLATE_PATH|" "$ENV_DEST" && rm -f "$ENV_DEST.bak"
    else
        echo "LOCAL_TEMPLATE_PATH=$TEMPLATE_PATH" >> "$ENV_DEST"
    fi
    LOGIN_INFO="  Login with test credentials:
    Workspace: test
    Passcode: test"
    MODE_INFO="LOCAL MODE"
else
    LOGIN_INFO="  Login with domain-specific credentials"
    MODE_INFO="PRODUCTION-LIKE MODE"
fi

# Validate required environment variables
if ! grep -q "^ANTHROPIC_API_KEY=" "$ENV_DEST" && ! grep -q "^ANTH_API_SECRET=" "$ENV_DEST"; then
    echo "Error: ANTHROPIC_API_KEY or ANTH_API_SECRET required in $ENV_SOURCE"
    exit 1
fi

cat <<EOF

✓ Workspace setup complete ($MODE_INFO)

Next steps:
  bun run dev  # Start dev server at http://localhost:8997

$LOGIN_INFO
EOF
