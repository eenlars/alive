# OAuth Hardening Phase 2 Draft PR Checklist

Tracks implementation for issue #132 (phase 2 only).

## Scope
- DB-backed OAuth state lifecycle with TTL and one-time consumption.
- External account conflict detection and deterministic conflict payload.
- Replay/expiry/conflict test coverage.

## Planned Changes
- `packages/database/migrations/*` (new migration(s))
- `packages/database/src/schema/integrations.ts` (or appropriate schema extension)
- regenerated database types (`bun run gen:db`)
- `apps/web/lib/oauth/oauth-flow-handler.ts`
- `apps/web/app/api/auth/[provider]/route.ts`
- `packages/oauth-core/src/index.ts`
- `packages/oauth-core/src/storage.ts` (if metadata helper support needed)
- callback consumer surfaces only as needed for conflict UX wiring

## Required Behavior
- Server creates state record on initiation.
- Callback consumes state exactly once.
- Expired state fails deterministically.
- Replayed state fails deterministically.
- External account identity conflicts return typed conflict payload:
  - code
  - action (`switch_context` / `contact_admin` / etc.)
  - conflict metadata safe for UI.

## Required Tests
- API/route tests for replay/expiry/conflict.
- oauth-core tests for identity conflict classification helpers.
- migration/schema checks pass.

## Validation Commands
- `bun run gen:db`
- `cd apps/web && bun run test app/api/auth/[provider]/__tests__/route.test.ts`
- `cd packages/oauth-core && bun run test`
- `bun run check:affected`

## Done Criteria
- OAuth state source of truth is server-side, not cookie-only.
- Conflict scenarios are deterministic and UI-actionable.
- Failure reason is attributable by provider + error code in observability.
