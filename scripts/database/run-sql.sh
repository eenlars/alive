#!/usr/bin/env bash
set -euo pipefail

# Run SQL against staging or production databases using env values from apps/web/.env.production.
#
# Examples:
#   scripts/database/run-sql.sh --target production --query "SELECT now();"
#   scripts/database/run-sql.sh --target staging --file /tmp/check.sql
#   scripts/database/run-sql.sh --target production --interactive
#   cat query.sql | scripts/database/run-sql.sh --target staging --stdin
#   scripts/database/run-sql.sh --target staging --url "postgresql://..." --query "SELECT now();"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/apps/web/.env.production}"

TARGET=""
QUERY=""
FILE_PATH=""
USE_STDIN=0
INTERACTIVE=0
CONFIRM_PRODUCTION_WRITE=0
SINGLE_TRANSACTION=0
URL_OVERRIDE=""

usage() {
  cat <<'EOF'
Usage:
  run-sql.sh --target <staging|production> [--query "<sql>" | --file <path> | --stdin | --interactive] [--tx] [--confirm-production-write] [--url "<postgres-url>"]

Options:
  --target <value>             Required. One of: staging, production
  --query "<sql>"              Execute a single SQL string
  --file <path>                Execute SQL from file
  --stdin                      Read SQL from stdin
  --interactive                Open interactive psql shell
  --tx                         Execute with psql --single-transaction (non-interactive modes)
  --confirm-production-write   Required for mutating SQL on production target
  --url "<postgres-url>"       Override DB URL instead of env lookup
  --help                       Show this message

Env resolution:
  ENV_FILE (default: apps/web/.env.production)
  production -> DATABASE_URL
  staging    -> STAGING_DATABASE_URL
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      [[ $# -ge 2 ]] || {
        echo "--target requires a value" >&2
        exit 1
      }
      TARGET="${2:-}"
      shift 2
      ;;
    --query)
      [[ $# -ge 2 ]] || {
        echo "--query requires a value" >&2
        exit 1
      }
      QUERY="${2:-}"
      shift 2
      ;;
    --file)
      [[ $# -ge 2 ]] || {
        echo "--file requires a value" >&2
        exit 1
      }
      FILE_PATH="${2:-}"
      shift 2
      ;;
    --stdin)
      USE_STDIN=1
      shift
      ;;
    --interactive)
      INTERACTIVE=1
      shift
      ;;
    --confirm-production-write)
      CONFIRM_PRODUCTION_WRITE=1
      shift
      ;;
    --tx)
      SINGLE_TRANSACTION=1
      shift
      ;;
    --url)
      [[ $# -ge 2 ]] || {
        echo "--url requires a value" >&2
        exit 1
      }
      URL_OVERRIDE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "--target is required" >&2
  usage
  exit 1
fi

if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
  echo "--target must be staging or production" >&2
  exit 1
fi

mode_count=0
[[ -n "$QUERY" ]] && mode_count=$((mode_count + 1))
[[ -n "$FILE_PATH" ]] && mode_count=$((mode_count + 1))
[[ "$USE_STDIN" -eq 1 ]] && mode_count=$((mode_count + 1))
[[ "$INTERACTIVE" -eq 1 ]] && mode_count=$((mode_count + 1))

if [[ "$mode_count" -ne 1 ]]; then
  echo "Choose exactly one of --query, --file, --stdin, --interactive" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

DATABASE_URL_RESOLVED=""
DB_PASSWORD_RESOLVED=""
if [[ -n "$URL_OVERRIDE" ]]; then
  DATABASE_URL_RESOLVED="$URL_OVERRIDE"
elif [[ "$TARGET" == "production" ]]; then
  DATABASE_URL_RESOLVED="${DATABASE_URL:-}"
  DB_PASSWORD_RESOLVED="${DATABASE_PASSWORD:-}"
else
  DATABASE_URL_RESOLVED="${STAGING_DATABASE_URL:-}"
  DB_PASSWORD_RESOLVED="${STAGING_DATABASE_PASSWORD:-${DATABASE_PASSWORD:-}}"
fi

if [[ -z "$DATABASE_URL_RESOLVED" ]]; then
  if [[ "$TARGET" == "staging" ]]; then
    echo "STAGING_DATABASE_URL is missing in $ENV_FILE (or environment)" >&2
  else
    echo "DATABASE_URL is missing in $ENV_FILE (or environment)" >&2
  fi
  exit 1
fi

# Supabase URLs sometimes omit password in DATABASE_URL while keeping DATABASE_PASSWORD separately.
if [[ -n "$DB_PASSWORD_RESOLVED" ]]; then
  export PGPASSWORD="$DB_PASSWORD_RESOLVED"
fi

is_mutating_sql() {
  local sql="$1"
  if echo "$sql" | grep -iqE '\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|REVOKE|GRANT)\b'; then
    return 0
  fi
  return 1
}

require_confirmation_for_production_write() {
  local sql="$1"
  if [[ "$TARGET" != "production" ]]; then
    return 0
  fi

  if is_mutating_sql "$sql"; then
    if [[ "$CONFIRM_PRODUCTION_WRITE" -ne 1 ]]; then
      echo "Mutating SQL detected on production target." >&2
      echo "Re-run with --confirm-production-write if intentional." >&2
      exit 1
    fi
  fi
}

run_psql() {
  local extra_args=("$@")
  psql "$DATABASE_URL_RESOLVED" -v ON_ERROR_STOP=1 "${extra_args[@]}"
}

if [[ "$INTERACTIVE" -eq 1 ]]; then
  if [[ "$TARGET" == "production" && "$CONFIRM_PRODUCTION_WRITE" -ne 1 ]]; then
    echo "Interactive sessions on production require --confirm-production-write." >&2
    exit 1
  fi
  echo "Opening interactive psql for target=$TARGET using $ENV_FILE"
  run_psql
  exit 0
fi

if [[ -n "$QUERY" ]]; then
  require_confirmation_for_production_write "$QUERY"
  args=(-c "$QUERY")
  [[ "$SINGLE_TRANSACTION" -eq 1 ]] && args=(--single-transaction "${args[@]}")
  run_psql "${args[@]}"
  exit 0
fi

if [[ -n "$FILE_PATH" ]]; then
  if [[ ! -f "$FILE_PATH" ]]; then
    echo "SQL file not found: $FILE_PATH" >&2
    exit 1
  fi
  require_confirmation_for_production_write "$(cat "$FILE_PATH")"
  args=(-f "$FILE_PATH")
  [[ "$SINGLE_TRANSACTION" -eq 1 ]] && args=(--single-transaction "${args[@]}")
  run_psql "${args[@]}"
  exit 0
fi

if [[ "$USE_STDIN" -eq 1 ]]; then
  sql="$(cat)"
  require_confirmation_for_production_write "$sql"
  args=()
  [[ "$SINGLE_TRANSACTION" -eq 1 ]] && args=(--single-transaction)
  printf '%s\n' "$sql" | run_psql "${args[@]}"
  exit 0
fi

echo "No execution mode selected" >&2
exit 1
