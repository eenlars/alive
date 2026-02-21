---
name: sql
description: Execute SQL against staging or production databases using the repo helper. Production writes require explicit confirmation.
---

# /sql

Use the helper script:

`scripts/database/sql.sh`

It loads DB URLs from `apps/web/.env.production` (or `ENV_FILE`) and supports:
- `--target staging` (uses `STAGING_DATABASE_URL`)
- `--target production` (uses `DATABASE_URL`)

## CRITICAL WARNINGS

**Production is live data. There is no undo.**

Before running ANY SQL:
1. **Read-only first** - Always SELECT before UPDATE/DELETE
2. **Use transactions** - Wrap destructive operations in BEGIN/ROLLBACK first
3. **Backup affected data** - SELECT into a backup table before modifying
4. **Limit scope** - Always use WHERE clauses, never update entire tables
5. **Double-check** - Read the query twice before executing

## Connection Details

**Location:** `apps/web/.env.production`

```bash
DATABASE_URL=$DATABASE_URL
STAGING_DATABASE_URL=$STAGING_DATABASE_URL
```

## How to Run SQL

### Single Query
```bash
scripts/database/sql.sh --target staging --query "SELECT now();"
```

### Multi-line / Complex Queries
```bash
cat << 'EOF' | scripts/database/sql.sh --target staging --stdin --tx
-- Your SQL here
SELECT * FROM iam.users LIMIT 5;
EOF
```

### Interactive Session
```bash
scripts/database/sql.sh --target staging --interactive
```

### Production Write (explicit confirm required)
```bash
scripts/database/sql.sh \
  --target production \
  --query "UPDATE iam.orgs SET credits = credits + 10 WHERE org_id = 'org_x'" \
  --confirm-production-write \
  --tx
```

## Database Schemas

| Schema | Purpose | Tables |
|--------|---------|--------|
| `iam` | Identity & Access | `users`, `orgs`, `org_memberships`, `sessions` |
| `app` | Application data | `domains`, `templates`, `feedback`, `scheduled_jobs` |
| `integrations` | OAuth & MCP | `providers`, `user_tokens` |
| `lockbox` | Encrypted secrets | `secret_keys`, `user_secrets` |
| `mcp` | MCP access control | `beta_access`, `org_access` |
| `public` | Supabase default | Various workflow tables |

## Common Safe Operations

### List tables in a schema
```bash
scripts/database/sql.sh --target staging --query "\dt iam.*"
```

### Describe a table
```bash
scripts/database/sql.sh --target staging --query "\d iam.users"
```

### Count rows
```bash
scripts/database/sql.sh --target staging --query "SELECT COUNT(*) FROM iam.users;"
```

## Safe Migration Pattern

For schema changes (CREATE TABLE, ALTER TABLE, etc.):

```bash
cat << 'EOF' | scripts/database/sql.sh --target staging --stdin --tx
-- Step 1: Create table
CREATE TABLE IF NOT EXISTS app.new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_new_table_col ON app.new_table(column_name);

-- Step 3: Grant permissions
GRANT ALL ON app.new_table TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.new_table TO authenticated;

-- Step 4: Verify
\d app.new_table
EOF
```

## Dangerous Operations Checklist

Before running UPDATE, DELETE, or DROP:

- [ ] I have run a SELECT with the same WHERE clause first
- [ ] I have counted the affected rows
- [ ] I have backed up the affected data if needed
- [ ] I have tested this in a transaction with ROLLBACK
- [ ] I understand this cannot be undone
- [ ] The user explicitly requested this change

### Safe DELETE Pattern
```sql
-- Step 1: Count what will be deleted
SELECT COUNT(*) FROM table WHERE condition;

-- Step 2: Review sample
SELECT * FROM table WHERE condition LIMIT 10;

-- Step 3: Test in transaction
BEGIN;
DELETE FROM table WHERE condition;
-- Check results
ROLLBACK;  -- Or COMMIT if correct

-- Step 4: Execute for real
DELETE FROM table WHERE condition;
```

## After Schema Changes

After creating or modifying tables, regenerate TypeScript types:

```bash
cd packages/database && bun run gen:types
```

This updates the generated types in `packages/database/src/*.generated.ts`.

## Forbidden Operations

**NEVER run these without explicit user confirmation:**

- `DROP TABLE` / `DROP SCHEMA`
- `TRUNCATE`
- `DELETE` without WHERE clause
- `UPDATE` without WHERE clause
- `ALTER TABLE ... DROP COLUMN`
- Any operation on `iam.users`, `iam.orgs` that affects many rows

## Quick Reference

```bash
# Staging read
scripts/database/sql.sh --target staging --query "SELECT 1;"

# Production read
scripts/database/sql.sh --target production --query "SELECT 1;"

# Production write (requires explicit confirmation flag)
scripts/database/sql.sh --target production --query "UPDATE ... WHERE ..." --confirm-production-write
```

## Environment Note

If `STAGING_DATABASE_URL` is not present in `apps/web/.env.production`, staging target will fail by design until it is configured.
