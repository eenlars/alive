# OAuth Scope Contract Tightening (Issue #131) - Checklist

## Goal
Make OAuth scope naming and tests capability-accurate so CI catches permission regressions before callback/runtime changes.

## Changes Made

### 1. Renamed scope constants (`packages/oauth-core/src/providers/google.ts`)
- [x] Added `GoogleProvider.SCOPES` object with all individual scope URIs as source of truth
- [x] Renamed `GMAIL_FULL_SCOPES` → `GMAIL_MODIFY_SCOPES` (reflects actual access: modify, not full)
- [x] Deleted `GMAIL_FULL_SCOPES` entirely (no external consumers)
- [x] Added `CALENDAR_SCOPES` profile (calendar.events + calendarlist.readonly + userinfo.email)
- [x] Rewired `GMAIL_READONLY_SCOPES` to use `SCOPES.*` constants

### 2. Contract tests (`packages/oauth-core/src/__tests__/providers.test.ts`)
- [x] Gmail modify: exact composition + excludes readonly (mutual exclusivity)
- [x] Gmail readonly: exact composition + excludes modify (mutual exclusivity)
- [x] Calendar: exact composition
- [x] Profile distinctness: Gmail and Calendar share only identity scopes

### 3. Cross-package alignment test (`apps/web/lib/oauth/__tests__/scope-alignment.test.ts`)
- [x] `GMAIL_MODIFY_SCOPES` matches `OAUTH_MCP_PROVIDERS.gmail.defaultScopes`
- [x] `CALENDAR_SCOPES` matches `OAUTH_MCP_PROVIDERS.google_calendar.defaultScopes`
- [x] Combined Google OAuth-only scopes cover both Gmail and Calendar capabilities

## Validation
- `cd packages/oauth-core && bun run test` — 79 tests pass
- `cd apps/web && bun run test scope-alignment` — 3 tests pass
- `bunx tsgo --noEmit` — clean

## Done Criteria
- [x] Constants are semantically accurate
- [x] Regression tests enforce scope contracts per feature profile
- [x] Cross-package alignment verified via real imports (not hardcoded copies)
- [x] Follow-up callback hardening PR (#174) can consume `GoogleProvider.SCOPES` directly
