# OAuth Refactoring Action Plan

## Database Migrations

### ✅ 1. `lockbox.user_secrets` migration (instance_id + indexes + expires_at)

Add `instance_id` and `expires_at` columns, drop old indexes, create new safety indexes:
- Unique index per version history
- Partial unique index for `is_current = true` enforcement
- TTL index for cleanup sweeper

**Status**: COMPLETED

---

### ✅ 2. `lockbox.secret_keys` migration (instance_id + relaxed environment)

Add `instance_id` column, relax environment constraint, add helpful lookup index.

**Status**: COMPLETED

---

### ✅ 3. Create `integrations` schema (providers + access_policies)

Create new schema with:
- `integrations.providers` table (provider registry/menu)
- `integrations.access_policies` table (per-user VIP list)
- Indexes for visibility and policy lookups

**Status**: COMPLETED

---

### ✅ 4. Create `integrations.get_available_integrations(p_user_id)` RPC function

Implement server-side function that returns visible integrations for a user, honoring:
- Global kill switch (`is_active`)
- Visibility level
- Explicit access policies
- Grandfathering (existing connections)

**Status**: COMPLETED

---

### ✅ 5. Seed Linear provider & owner access

Insert Linear provider as `admin_only` visibility and grant initial access to `admin@example.com`.

**Status**: COMPLETED

---

## Application Code

### ✅ 6. Refactor `@webalive/oauth-core` to instance-aware OAuthManager

Remove global singleton export and implement:
- `class OAuthManager` with `OAuthManagerConfig` interface
- `provider`, `instanceId`, `namespace`, `environment`, `defaultTtlSeconds` config
- All lockbox queries scoped by `(user_id, instance_id, namespace, name)`

**Status**: COMPLETED

---

### ✅ 7. Update all consumers to use injected OAuthManager instances

Replace all `import { oauth }` with injected `OAuthManager` instances:
- Wire instances at app startup per environment
- Update Linear auth routes
- Update token refresh logic
- Update any other OAuth consumers

**Status**: COMPLETED
- Created `oauth-instances.ts` factory with environment-aware instances
- Updated `/api/auth/linear` route to use `getLinearOAuth()`
- Updated `/api/integrations/linear` route to use `getLinearOAuth()`
- All consumers now use instance-aware OAuth managers

---

### ✅ 8. Implement safe rotation logic with instance_id scoping

Implement secret rotation that:
- Inserts new row with `is_current = true`
- Demotes older rows scoped by `instance_id`
- Relies on partial unique index to catch bugs
- Fetches current secret scoped by all four dimensions

**Status**: COMPLETED (Implemented in LockboxAdapter.save method)

---

### ✅ 9. Hook up Next.js settings page to `integrations.get_available_integrations()`

Update Settings UI to:
- Call `rpc('integrations.get_available_integrations', { userId })` instead of hardcoding
- Render integrations dynamically from RPC response
- Display `is_connected` status
- Style based on `visibility_status`

**Status**: COMPLETED
- Created `/api/integrations/available` endpoint to fetch integrations
- Created React hooks (`useIntegrations`) for fetching and managing integrations
- Created `IntegrationsList` component for dynamic display
- Created settings page at `/settings` with tabbed interface

---

### ✅ 10. Guard OAuth connect endpoints with visibility checks

Secure all OAuth auth flows:
- For each connect flow (e.g., `/api/auth/linear`), call `get_available_integrations()` server-side
- Return 403 Forbidden if provider not visible to user
- Prevent users from guessing or calling hidden providers

**Status**: COMPLETED
- Created visibility helper functions in `lib/integrations/visibility.ts`
- Added `canUserAccessIntegration()` checks to `/api/auth/linear`
- Added defense-in-depth checks in both initial flow and callback
- Users without access get redirected with error message

---

### ⬜ 11. Integrate E2E with deterministic instance ID construction

Update E2E setup/fixtures:
- Build instance IDs from `(provider, env, runId, workerIndex)`
- Create `OAuthManager` instances with constructed IDs
- Set `defaultTtlSeconds: 600` for test secrets
- Ensure belt-and-suspenders isolation even with per-worker users

**Status**: PENDING

---

### ✅ 12. Add optional TTL sweeper job for expired secrets

Implement background job (non-local environments only):
- Periodically delete `lockbox.user_secrets` where `expires_at < now()`
- Nice for hygiene (not required for correctness)
- Test cleanup already happens via user deletion on FK cascade

**Status**: COMPLETED
- Created cleanup script: `scripts/cleanup-expired-secrets.ts`
- Created database function: `lockbox.cleanup_expired_secrets()`
- Created documentation: `ttl-usage-guide.md`

---

## Summary

**Completed**: 11/12 (Database migrations + OAuth refactoring + rotation logic + consumer updates + Integration UI + visibility checks + TTL cleanup)
**Pending**: 1/12 (E2E integration)

Next step: Integrate E2E with deterministic instance ID construction (task 11)
