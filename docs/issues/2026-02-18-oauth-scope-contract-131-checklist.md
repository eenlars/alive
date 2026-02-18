# OAuth Scope Contract Tightening (Issue #131) - Draft Checklist

## Goal
Make OAuth scope naming and tests capability-accurate so CI catches permission regressions before callback/runtime changes.

## Scope
- Rename misleading Google scope constants to match actual access semantics.
- Add regression contract tests for Gmail and Calendar feature/tool profiles.
- Ensure shared scope expectations are explicit and reusable by callback verification work.

## Planned Code Targets
- `packages/oauth-core/src/providers/google.ts`
- `packages/oauth-core/src/__tests__/providers.test.ts`
- `packages/oauth-core/src/__tests__/oauth-errors.test.ts` (if contract mapping coverage is added)
- `packages/shared/src/mcp-providers.ts` (if scope source-of-truth alignment is required)

## Required Contracts

### Gmail
- Modify-level contract includes the exact scopes needed for compose/read/label workflows.
- Readonly contract remains separately defined and tested.

### Calendar
- Contract tests assert required scopes for:
  - list/read
  - availability/freebusy
  - create/update event workflows

## Required Tests
- Failing test when required scope is removed from a capability profile.
- Test coverage for constant naming semantics (no "full" naming drift when not full access).

## Validation Commands
- `cd packages/oauth-core && bun run test`
- `bun run check:affected`

## Done Criteria
- Constants are semantically accurate.
- Regression tests enforce scope contracts per feature profile.
- Follow-up callback hardening PRs can consume these contracts directly.
