# Auth/RLS Contract Gate and Drift Audit

This project uses two separate controls:

1. **PR-blocking gate** (`Auth/RLS Contract` in `.github/workflows/ci.yml`)
- Runs `bun run test:jwt-rls-smoke` against configured contract-test Supabase credentials.
- Validates auth and RLS behavior quickly.
- Does **not** replay migrations from zero (optimized for fast iteration).

2. **Nightly drift audit** (`.github/workflows/nightly-db-drift.yml`)
- Replays repo migrations into an ephemeral local Postgres baseline.
- Diffs baseline schema against the staging database schema.
- Publishes drift artifact: `.artifacts/schema-drift/schema-drift.diff`.
- Non-strict mode by default (`STRICT=0`), so it reports drift without blocking developer PRs.

## Required GitHub Secrets

For PR gate:
- `CI_CONTRACT_SUPABASE_URL`
- `CI_CONTRACT_SUPABASE_ANON_KEY`
- `CI_CONTRACT_SUPABASE_SERVICE_ROLE_KEY`
- `CI_CONTRACT_JWT_SECRET`

For nightly drift audit:
- `STAGING_DATABASE_URL`

## Local Commands

Run contract smoke locally:

```bash
bun run test:jwt-rls-smoke
```

Run schema drift check locally (requires `STAGING_DATABASE_URL` and local Postgres):

```bash
STAGING_DATABASE_URL=postgresql://... bun run db:drift-check
```

Strict mode (fails when drift exists):

```bash
STRICT=1 STAGING_DATABASE_URL=postgresql://... bun run db:drift-check
```

## Two-Database Rollout Path

Current setup supports fast dev flow while preparing for strict staging→production promotion:

1. Keep PR gate fast and blocking for auth/RLS behavior.
2. Keep nightly drift audit reporting.
3. Later, enable `STRICT=1` in a promotion pipeline before production deploys.
