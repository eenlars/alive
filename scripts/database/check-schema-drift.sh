#!/usr/bin/env bash
set -euo pipefail

STRICT="${STRICT:-0}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-packages/database/migrations}"
OUTPUT_DIR="${OUTPUT_DIR:-.artifacts/schema-drift}"
SCHEMAS="${SCHEMAS:-app iam lockbox integrations}"

: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL must be set}"

LOCAL_PGHOST="${DRIFT_LOCAL_PGHOST:-localhost}"
LOCAL_PGPORT="${DRIFT_LOCAL_PGPORT:-5432}"
LOCAL_PGUSER="${DRIFT_LOCAL_PGUSER:-postgres}"
LOCAL_PGPASSWORD="${DRIFT_LOCAL_PGPASSWORD:-postgres}"
BASELINE_DB_NAME="${BASELINE_DB_NAME:-alive_drift_${GITHUB_RUN_ID:-local}_$RANDOM}"

mkdir -p "$OUTPUT_DIR"
STATUS_FILE="$OUTPUT_DIR/status.env"
DRIFT_FILE="$OUTPUT_DIR/schema-drift.diff"
BASELINE_DUMP="$OUTPUT_DIR/baseline.schema.sql"
STAGING_DUMP="$OUTPUT_DIR/staging.schema.sql"

echo "SCHEMA_DRIFT=0" > "$STATUS_FILE"
echo "BASELINE_DB_NAME=$BASELINE_DB_NAME" >> "$STATUS_FILE"

local_pg() {
  local cmd="$1"
  shift
  PGHOST="$LOCAL_PGHOST" \
    PGPORT="$LOCAL_PGPORT" \
    PGUSER="$LOCAL_PGUSER" \
    PGPASSWORD="$LOCAL_PGPASSWORD" \
    "$cmd" "$@"
}

cleanup() {
  local_pg dropdb --if-exists "$BASELINE_DB_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

normalize_dump() {
  local input="$1"
  local output="$2"

  sed -E \
    -e '/^--/d' \
    -e '/^SET /d' \
    -e '/^SELECT pg_catalog.set_config/d' \
    -e '/^\\(un)?restrict /d' \
    -e '/^[[:space:]]*$/d' \
    "$input" | sed -E 's/[[:space:]]+$//' > "$output"
}

build_schema_args() {
  local args=()
  for schema in $SCHEMAS; do
    args+=(--schema="$schema")
  done
  printf '%s\n' "${args[@]}"
}

dump_schema() {
  local url="$1"
  local output="$2"
  local raw_output="${output}.raw"
  local schema_args=()

  while IFS= read -r arg; do
    schema_args+=("$arg")
  done < <(build_schema_args)

  pg_dump "$url" --schema-only --no-owner --no-privileges --no-comments "${schema_args[@]}" > "$raw_output"
  normalize_dump "$raw_output" "$output"
}

echo "Preparing baseline database: $BASELINE_DB_NAME"
local_pg dropdb --if-exists "$BASELINE_DB_NAME" >/dev/null 2>&1 || true
local_pg createdb "$BASELINE_DB_NAME"

BASELINE_DATABASE_URL="postgresql://${LOCAL_PGUSER}:${LOCAL_PGPASSWORD}@${LOCAL_PGHOST}:${LOCAL_PGPORT}/${BASELINE_DB_NAME}"

echo "Applying migrations from $MIGRATIONS_DIR"
while IFS= read -r migration; do
  echo "  -> $(basename "$migration")"
  psql "$BASELINE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort -V)

echo "Dumping baseline schema"
dump_schema "$BASELINE_DATABASE_URL" "$BASELINE_DUMP"
echo "Dumping staging schema"
dump_schema "$STAGING_DATABASE_URL" "$STAGING_DUMP"

if diff -u "$BASELINE_DUMP" "$STAGING_DUMP" > "$DRIFT_FILE"; then
  echo "No schema drift detected."
  exit 0
fi

echo "Schema drift detected."
echo "SCHEMA_DRIFT=1" > "$STATUS_FILE"
echo "BASELINE_DB_NAME=$BASELINE_DB_NAME" >> "$STATUS_FILE"

echo "----- Drift preview (first 200 lines) -----"
sed -n '1,200p' "$DRIFT_FILE"

if [[ "$STRICT" == "1" ]]; then
  echo "STRICT=1 enabled, failing due to drift."
  exit 1
fi

echo "Non-strict mode: drift reported without failing."
