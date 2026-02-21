# OAuth Hardening Phase 1 Draft PR Checklist

Tracks implementation for issue #132 (phase 1 only).

## Scope
- Callback hardening without DB schema changes.
- Granted-scope verification at callback.
- Normalized OAuth error taxonomy + deterministic callback payload contract.
- Lifecycle observability events for initiation/callback/reconnect outcomes.
- Route-level tests for `/api/auth/[provider]`.

## Planned Changes
- `apps/web/lib/oauth/oauth-flow-handler.ts`
- `apps/web/app/api/auth/[provider]/route.ts`
- `apps/web/app/oauth/callback/page.tsx`
- `apps/web/hooks/use-integrations.ts`
- `apps/web/lib/integrations/toast-validation.ts`
- `apps/web/lib/error-codes.ts`
- `apps/web/lib/analytics/events.ts`
- `packages/oauth-core/src/index.ts` (only if required for scope parse/normalize helper reuse)

## Required Tests
- Add `apps/web/app/api/auth/[provider]/__tests__/route.test.ts`:
  - unauthenticated -> 401
  - invalid state -> typed callback error
  - missing required scopes -> typed callback error
  - provider error mapping -> typed callback error
  - success callback -> success status and persisted connection

## Validation Commands
- `cd apps/web && bun run test app/api/auth/[provider]/__tests__/route.test.ts`
- `cd packages/oauth-core && bun run test`
- `bun run check:affected`

## Done Criteria
- Stable callback contract (`status`, `error_code`, `error_action`, `message`) is consumed by popup and chat/settings surfaces.
- Missing required scopes fail at callback before token persistence.
- Observability has provider + normalized error code for failed callback.
