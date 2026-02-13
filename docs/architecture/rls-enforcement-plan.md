# RLS Enforcement Plan For User-Facing Routes

Status: Draft  
Last updated: 2026-02-13

This document defines how to enforce Postgres Row-Level Security (RLS) for user-facing API routes without breaking admin/system flows.

It intentionally does not include real credentials, project IDs, passwords, or secret values.

## Goal

Use `anon` + user JWT for user-facing queries so Postgres RLS is always in the path. Keep `service_role` only where elevated access is explicitly required.

RLS is defense-in-depth. App-layer auth (`getSessionUser()`, scope checks, org checks) remains required.

## What Was Wrong In The Previous Draft

1. It embedded production-sensitive values (JWT secret, DB password, concrete hostnames).
2. It relied on a point-in-time cloud DB snapshot as if it were durable truth.
3. It omitted `JWT_ALGORITHM` implications (HS256 vs ES256).
4. It did not call out local/standalone non-JWT session values that can break RLS clients.
5. It mixed investigation notes with execution steps, making rollout and rollback harder to follow.

## Current Code Reality (Verified In Repo)

1. `SessionPayloadV3` requires `role: "authenticated"` and new tokens include it.  
   File: `apps/web/features/auth/lib/jwt.ts`
2. `createRLSClient()` plus schema-typed variants exist:
   - `createRLSAppClient()`
   - `createRLSIamClient()`  
   File: `apps/web/lib/supabase/server-rls.ts`
3. Many user-facing routes still use `createAppClient("service")` / `createIamClient("service")`.  
   Files: `apps/web/app/api/**/route.ts`
4. RLS client factories are fail-closed: non-JWT session values are rejected (no service-role fallback).

## Scope

In scope:
- JWT claim update for Supabase role selection.
- RLS client factory improvements.
- RLS policy migration for user-facing tables.
- Route-by-route migration from service-role reads to RLS reads.
- Test and rollout plan.

Out of scope:
- Replacing app-layer authorization logic.
- Full migration of admin/manager/internal routes.
- Any secret rotation procedure details specific to one environment.

## Decision Rules

Use `service_role` only for:
- Pre-auth flows (`/api/login`, `/api/auth/signup`).
- Manager/admin/internal endpoints.
- Background workers without end-user request context.
- Operations that intentionally bypass user boundaries (with explicit justification in code comments).

Everything else should default to RLS clients.

## Phase 0: Prerequisites

### 0.1 Align JWT verification between app and Supabase

RLS only works when Supabase can verify app-issued JWTs.

- If `JWT_ALGORITHM=HS256`, Supabase must verify with the same shared secret used by app signing.
- If `JWT_ALGORITHM=ES256`, Supabase must be configured to verify against the corresponding public key/JWK configuration.

Do not hardcode secrets in docs or scripts. Use environment/secret manager values only.

### 0.2 Add role claim for PostgREST role switch

Update token payload to include:

```ts
role: "authenticated"
```

Files:
- `apps/web/features/auth/lib/jwt.ts` (`SessionPayloadV3` + `createSessionToken`)
- `apps/web/features/auth/lib/__tests__/jwt.test.ts` (assert claim exists)

Note on rollout:
- Any token without this claim is invalid by design.

### 0.3 Handle non-JWT local/standalone session values

Policy: fail closed for RLS calls if session value is not a JWT.
No service-role fallback.

## Phase 1: Database Migration (Policies)

Create migration file:

`packages/database/migrations/0002_rls_user_routes.sql`

Migration requirements:

1. Idempotent policy creation (safe re-run).
2. Explicit comments for each policy intent.
3. No assumptions that cloud policy state matches historical notes.
4. No embedded credentials.

Candidate targets:
- `app.domains`
- `iam.orgs`
- `iam.org_memberships`
- `iam.user_preferences`
- `app.conversations`
- `app.conversation_tabs`
- `app.messages`
- `app.automation_jobs` (user read)
- `app.automation_runs` (user read through job ownership)
- `lockbox.secret_keys` and `lockbox.user_secrets` policy predicates should use `lockbox.sub()` instead of `auth.uid()`

Recommended verification queries (run before and after migration):

```sql
SELECT n.nspname AS schema, c.relname AS table, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname IN ('app', 'iam', 'lockbox')
ORDER BY 1, 2;

SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname IN ('app', 'iam', 'lockbox')
ORDER BY 1, 2, 3;
```

## Phase 2: RLS Client Factories

Update `apps/web/lib/supabase/server-rls.ts`:

1. Keep `createRLSClient()` for backward compatibility if needed.
2. Add schema-typed helpers:
   - `createRLSAppClient()` (`db.schema = "app"`)
   - `createRLSIamClient()` (`db.schema = "iam"`)
3. Reuse `getSafeSessionCookie()` and implement chosen local/standalone behavior from Phase 0.3.
4. Keep server-only guard.

## Phase 3: Route Migration

Migrate in small batches with tests after each batch.

### Batch A: Low-risk user profile and listing routes

- `apps/web/app/api/user/preferences/route.ts`
- `apps/web/app/api/auth/organizations/route.ts` (read path first)
- `apps/web/app/api/sites/route.ts`

### Batch B: Workspace selection routes

- `apps/web/app/api/auth/workspaces/route.ts`
- `apps/web/app/api/auth/all-workspaces/route.ts`

Superadmin branch can stay on service-role where global visibility is intentional.

### Batch C: Conversation/session reads

- `apps/web/app/api/conversations/route.ts`
- `apps/web/app/api/conversations/messages/route.ts`
- `apps/web/app/api/conversations/sync/route.ts`
- `apps/web/app/api/sessions/route.ts` (keep service-role for `iam.sessions` if RLS is not enabled there)
- `apps/web/app/api/sessions/history/route.ts`

### Batch D: Automation user reads

- `apps/web/app/api/automations/route.ts`
- `apps/web/app/api/automations/[id]/route.ts`
- `apps/web/app/api/automations/[id]/runs/route.ts`
- `apps/web/app/api/automations/[id]/runs/[runId]/route.ts`
- `apps/web/app/api/automations/[id]/trigger/route.ts` (read checks only)

### Batch E: High-impact streaming path

- `apps/web/app/api/claude/stream/route.ts`

## Phase 4: Testing

Mandatory:

1. JWT tests
   - Assert `role: "authenticated"` is present in new tokens.
   - Keep backward compatibility expectations explicit.
2. Route tests for each migrated endpoint
   - Unauthenticated returns `401`.
   - Happy path success.
   - Unauthorized cross-org access denied.
3. Integration test
   - Re-enable and fix `apps/web/features/auth/lib/__tests__/rls-integration.test.ts`.
   - Verify cross-org isolation for `app.domains`.

Recommended command sequence:

```bash
bun run --cwd apps/web test
bun run lint
bun run type-check
```

## Rollout Plan

1. Apply migration in staging.
2. Deploy code with JWT role claim + RLS clients + first route batch.
3. Validate staging behavior with real user tokens.
4. Continue batch rollout until all targeted routes are migrated.
5. Deploy to production.
6. Monitor error rate and authorization-denied patterns.

## Rollback Plan

If a batch causes regressions:

1. Revert that batch's route client usage back to service-role.
2. Keep JWT role claim change (safe to keep).
3. Keep additive policies unless they are proven incorrect; if needed, drop only the new problematic policy by name.
4. Re-run route tests and redeploy.

## Acceptance Criteria

All must be true:

1. User-facing targeted routes use RLS clients for reads.
2. Cross-org reads return no data for non-members.
3. Superadmin/global paths still function as intended.
4. Local/standalone behavior is explicit and tested.
5. No production secrets or credentials are present in repository docs or scripts.

## Optional Optimization

`iam.is_org_member()` can optionally check JWT `orgIds` first, then fallback to DB lookup for correctness with stale tokens.

Only do this after baseline RLS rollout is stable.
