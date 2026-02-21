#!/usr/bin/env bash
set -euo pipefail

command -v bun >/dev/null 2>&1 || {
    echo "Error: bun is not installed"
    echo "Install from: https://bun.sh"
    exit 1
}

echo "Setting up workspace..."

bun install || {
    echo "Error: Failed to install dependencies"
    exit 1
}

# Creates .alive/template directory
bun run setup || {
    echo "Error: Project setup failed"
    exit 1
}

# Generate .env.local for local dev
ENV_DEST="./apps/web/.env.local"
TEMPLATE_PATH="$(pwd)/.alive/template"

mkdir -p "$(dirname "$ENV_DEST")"
touch "$ENV_DEST"

upsert_env_var() {
    local key="$1"
    local value="$2"

    if grep -q "^${key}=" "$ENV_DEST"; then
        sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_DEST"
        rm -f "$ENV_DEST.bak"
    else
        printf "%s=%s\n" "$key" "$value" >> "$ENV_DEST"
    fi
}

ensure_env_var() {
    local key="$1"
    local value="$2"

    if ! grep -q "^${key}=" "$ENV_DEST"; then
        printf "%s=%s\n" "$key" "$value" >> "$ENV_DEST"
    fi
}

upsert_env_var "STREAM_ENV" "local"
upsert_env_var "LOCAL_TEMPLATE_PATH" "$TEMPLATE_PATH"
ensure_env_var "NEXT_PUBLIC_PREVIEW_BASE" "sonno.tech"

# Minimal placeholders for local env validation. Real Supabase values can still
# be provided in apps/web/.env.local and will be preserved.
ensure_env_var "SUPABASE_URL" "https://placeholder.supabase.co"
ensure_env_var "SUPABASE_ANON_KEY" "eyJ.placeholder"
ensure_env_var "NEXT_PUBLIC_SUPABASE_URL" "https://placeholder.supabase.co"
ensure_env_var "NEXT_PUBLIC_SUPABASE_ANON_KEY" "eyJ.placeholder"

cat <<EOF

✓ Workspace ready

  bun run dev  # Start dev server at http://localhost:8997

  Login:
    Workspace: test
    Passcode:  test
EOF
