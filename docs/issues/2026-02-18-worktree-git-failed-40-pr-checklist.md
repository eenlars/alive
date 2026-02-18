# Worktree Git Failure Hardening (Issue #40) - Draft Checklist

## Goal
Turn `WORKTREE_GIT_FAILED` from an opaque 500 into a diagnosable, action-oriented failure contract without leaking unsafe internals to clients.

## Current Gap
- Client receives generic `WORKTREE_GIT_FAILED` and request ID, but root cause is hard to triage quickly.
- Failures are wrapped in message text, not a stable structured diagnostic contract.

## Planned Code Targets
- `apps/web/features/worktrees/lib/worktrees.ts`
- `apps/web/app/api/worktrees/route.ts`
- `apps/web/app/api/worktrees/__tests__/route.test.ts`
- `apps/web/features/worktrees/lib/__tests__/worktrees.test.ts`

## Scope

### 1) Structured Git Failure Diagnostics
- Refactor `runGit()` failure wrapping to include structured metadata on `WorktreeError`:
  - operation (`list|add|remove|branch|status|rev-parse`)
  - git args (sanitized)
  - exit code
  - stderr tail (truncated)
- Keep `WORKTREE_GIT_FAILED` as the public error code.

### 2) API Error Mapping + Safe Surface
- Ensure `/api/worktrees` returns safe details that help support triage (request ID + operation hint), without exposing absolute filesystem paths or full stderr.
- Add Sentry tags/context for worktree operation, workspace, slug, and request ID.

### 3) Actionable Observability
- Emit a single structured server log line for git failures that can be correlated by `requestId`.
- Avoid string-only free-form logs for this failure path.

## Required Tests
- `worktrees.test.ts`: verifies git failure wraps into `WorktreeError("WORKTREE_GIT_FAILED")` with structured metadata.
- `route.test.ts`: verifies `WORKTREE_GIT_FAILED` maps to 500 and includes safe, non-leaky response details.
- `route.test.ts`: verifies known worktree metadata fields are attached to Sentry/log context.

## Validation Commands
- `cd apps/web && bun run test app/api/worktrees/__tests__/route.test.ts`
- `cd apps/web && bun run test features/worktrees/lib/__tests__/worktrees.test.ts`
- `bun run check:affected`

## Done Criteria
- Failures remain secure for clients but are actionable for operators.
- Request ID + structured metadata are enough to identify failed git command class quickly.
- Regression tests fail if diagnostics become opaque or leak unsafe internals.
