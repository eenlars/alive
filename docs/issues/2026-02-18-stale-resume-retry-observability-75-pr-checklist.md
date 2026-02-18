# Stale Resume Retry Observability Contract (Issue #75) - Draft Checklist

## Goal
Finish issue #75 by hardening retry observability and tests, without re-implementing retry behavior already merged.

## Already In Main (from PR #47, merged 2026-02-14)
- stale session/message retry handling in `apps/web/app/api/claude/stream/route.ts`
- fallback logic that clears stale resume pointers and retries safely

## Remaining Gap vs Acceptance Criteria
- No explicit, stable structured retry contract fields proven by tests:
  - `retry_attempted`
  - `retry_reason`
  - `retry_outcome`

## Planned Code Targets
- `apps/web/app/api/claude/stream/route.ts`
- `apps/web/app/api/claude/stream/__tests__/session-recovery.test.ts`
- `apps/web/lib/request-logger.ts` (only if needed for structured logging ergonomics)

## Scope

### 1) Structured Retry Contract
- Define a typed retry observability payload for stale resume recovery paths.
- Ensure every handled failure path emits explicit fields:
  - `retry_attempted: true|false`
  - `retry_reason: stale_session|stale_message|not_applicable`
  - `retry_outcome: success|failed|not_attempted`

### 2) Deterministic Emission Rules
- Emit the retry contract exactly once per failed attempt path.
- Keep semantics consistent across:
  - stale session ID recovery
  - stale `resumeSessionAt` recovery
  - non-stale failures (must remain `not_attempted`)

### 3) Regression Tests For Observability Contract
- Add tests asserting exact field values (not substring-only log checks) for:
  - stale-session -> retry success
  - stale-session -> retry fails
  - non-stale failure -> no retry
- Add/extend stale-message recovery assertions if that path emits retry fields separately.

## Validation Commands
- `cd apps/web && bun run test app/api/claude/stream/__tests__/session-recovery.test.ts`
- `bun run check:affected`

## Done Criteria
- Functional behavior remains unchanged.
- Structured retry fields are explicit and stable.
- Tests fail if observability contract drifts.
