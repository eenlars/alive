# OAuth Hardening Epic #132 - Execution Plan

## Goal
Ship OAuth hardening in two phases with deterministic callback behavior, typed failure handling, and test-backed safety.

## Baseline (as of 2026-02-18)

### 1. State lifecycle is cookie-only
- `apps/web/lib/oauth/oauth-flow-handler.ts`
  - `OAuthStateManager.createState()` writes `oauth_state_<provider>` cookie.
  - `OAuthStateManager.validateState()` validates cookie and clears it.
- Gap: no server record for consumed/expired/replayed state.

### 2. Callback scope verification is missing
- `apps/web/lib/oauth/oauth-flow-handler.ts`
  - `handleOAuthCallback()` calls `oauthManager.handleCallback(...)` and treats any token exchange as success.
- `packages/oauth-core/src/index.ts`
  - `handleCallback()` returns `{ success, scopes }`, but caller does not enforce required scopes.

### 3. Conflict handling is implicit/non-deterministic
- Current token storage is keyed by user/provider in lockbox namespace (`oauth_connections`) via:
  - `packages/oauth-core/src/index.ts`
  - `packages/oauth-core/src/storage.ts`
- Gap: no explicit external-account identity metadata or typed conflict response.

### 4. Error contract is message-centric
- `apps/web/app/api/auth/[provider]/route.ts`
- `apps/web/lib/oauth/oauth-flow-handler.ts`
- `apps/web/app/oauth/callback/page.tsx`
- `apps/web/hooks/use-integrations.ts`
- Gap: status + message, no stable `error_code` contract for UI actions.

### 5. Observability is partial
- OAuth logs exist (`errorLogger.oauth`, console logs, `oauthAudit`) but no complete lifecycle analytics contract in web app.
- `apps/web/lib/analytics/events.ts` currently tracks integration connect/disconnect, not callback failure classes.

## Phase Plan

## Phase 1 (no DB schema changes)

### Slice 1: Typed OAuth error taxonomy + callback contract
- Add typed OAuth error codes and action mapping:
  - `apps/web/lib/error-codes.ts`
  - new helper: `apps/web/lib/oauth/oauth-error-taxonomy.ts`
- Update callback redirect payload to include structured fields:
  - `integration`, `status`, `error_code`, `error_action`, `message`
- Update popup and toast parsing to use code/action first, message second.

### Slice 2: Granted-scope verification in callback
- Add provider-aware scope normalization helper (space/comma variants).
- Compare granted scopes vs required scopes from provider config.
- Fail callback before persisting connection on missing required scopes.
- File targets:
  - `apps/web/lib/oauth/oauth-flow-handler.ts`
  - `packages/oauth-core/src/index.ts` (if helper belongs here)
  - `apps/web/lib/oauth/providers.ts` (required-scope source)

### Slice 3: Lifecycle observability
- Emit structured events for:
  - initiation
  - callback success
  - callback failure (typed code)
  - reconnect outcome
- File targets:
  - `apps/web/lib/analytics/events.ts`
  - `apps/web/hooks/use-integrations.ts`
  - `apps/web/lib/oauth/oauth-flow-handler.ts`

### Slice 4: Route tests for callback hardening
- Add new tests:
  - `apps/web/app/api/auth/[provider]/__tests__/route.test.ts`
- Required cases:
  - unauthenticated -> 401
  - invalid state -> typed state error
  - missing scope -> typed missing-scope error
  - provider denial/error -> typed mapped error
  - success path -> success redirect payload

## Phase 2 (DB schema + conflict/state persistence)

### Slice 5: Server-side OAuth state records
- Add `oauth_states` table in integrations schema (or security-appropriate schema) with:
  - `state_id`, `state_hash`, `provider`, `integration_key`
  - `initiating_user_id`
  - context snapshot (`org_id`, `workspace` if available)
  - `created_at`, `expires_at`, `consumed_at`, `consumed_by_user_id`
- Replace cookie-only validation with record create + consume semantics.
- Keep cookie as optional defense-in-depth marker, not source of truth.

### Slice 6: External account identity + conflict policy
- Add metadata store for external identity (example: provider + external_account_id).
- Enforce deterministic policy on callback when identity exists in incompatible context.
- Return typed conflict payload for UI action.

### Slice 7: Conflict and replay tests
- Add API/integration tests for:
  - replayed state (second consume fails)
  - expired state (fails with typed code)
  - same account same context (allowed reconnect)
  - same account different incompatible context (typed conflict)

## Proposed DB Artifacts (phase 2 draft)
- Migration path: `packages/database/migrations/`
- Schema type updates:
  - `packages/database/src/schema/integrations.ts`
  - regenerate types: `bun run gen:db`

## Proposed callback error/action contract

```ts
type OAuthErrorAction = "retry" | "reconnect" | "switch_context" | "contact_admin"

type OAuthCallbackPayload = {
  integration: string
  status: "success" | "error"
  error_code?: string
  error_action?: OAuthErrorAction
  message?: string
}
```

## Execution Checklist
- [ ] Implement Slice 1 + tests
- [ ] Implement Slice 2 + tests
- [ ] Implement Slice 3 + instrumentation verification
- [ ] Run phase 1 checks
- [ ] Implement phase 2 migrations + schema regeneration
- [ ] Implement Slice 5/6 + tests
- [ ] Run full hardening checks and regression pass

## Commands
- `cd apps/web && bun run test app/api/auth/[provider]/__tests__/route.test.ts`
- `cd packages/oauth-core && bun run test`
- `bun run check:affected`
- `bun run static-check` (before merge if broad changes)

## Notes
- Do not add new env vars unless unavoidable; prefer existing provider config paths.
- Keep scope source of truth centralized; avoid per-route hardcoded scope arrays.
- Preserve existing user-facing happy path for popup OAuth connect.
