# Superadmin Automations For Alive Workspace (Issue #177) - Draft Checklist

## Goal
Enable superadmin-only automations that run in the alive repo (resolved from `serverConfig.paths.aliveRoot`) with superadmin tool policy, while preserving current site automation behavior.

## Chosen Strategy
Keep the existing `automation_jobs.site_id` model and add a reserved/synthetic `alive` domain target for system-workspace jobs.

## Planned Code Targets
- `apps/web/migrations/*` (reserved alive domain row)
- `apps/web/app/api/sites/route.ts`
- `apps/web/app/api/automations/route.ts`
- `apps/web/lib/automation/validation.ts`
- `packages/shared/src/stream-tools.ts` (workspace path helper)
- `apps/web/lib/automation/executor.ts`
- `apps/web/lib/automation/attempts.ts` (alive superadmin flags, credit-bypass at claim time)
- `apps/web/components/automations/AutomationSidePanel.tsx`
- `apps/web/components/automations/tabs/GeneralTab.tsx`
- `apps/web/app/api/automations/[id]/trigger/route.ts`

## Scope

### 1) Reserved Alive Workspace Target
- Add/ensure a reserved `app.domains` row for `alive` on this server.
  - Migration must be idempotent (`INSERT … ON CONFLICT DO NOTHING`).
  - Rollback/down-migration: delete the reserved row only if no `automation_jobs` reference it (`DELETE … WHERE NOT EXISTS (SELECT 1 FROM app.automation_jobs WHERE site_id = …)`).
- Keep `site_id`/`org_id` schema unchanged in this issue.
- Alive jobs carry `org_id = NULL` (no real org). All downstream queries, RLS policies, and credit-check logic must handle `NULL org_id` safely (skip credit checks, no org-scoped joins).

### 2) API Surface
- `/api/sites`: include `alive` option for superadmins only.
- `/api/automations` create: allow `alive` site only for superadmins.
- Non-superadmin attempts must return `403`.

### 3) Execution Semantics
- `workspace === "alive"` resolves to `SUPERADMIN.WORKSPACE_PATH`.
- Bypass org credit checks for `alive` jobs only.
  - Bypass eligibility re-confirmed at claim/execution time by comparing `job.site_id` to the reserved alive domain row ID from the database — not a string literal from the job payload.
  - Bypass condition must not be influenceable by client-supplied data (e.g., `workspace` string from job payload).
- Preserve existing credit checks for regular sites.

### 4) Worker Policy
- Alive jobs run with superadmin/admin flags in worker pool config.
- Tool policy for alive automations matches superadmin chat expectations.

### 5) UI
- Show an explicit elevated "Alive Workspace" option in automation creation for superadmins.
- Keep option hidden for non-superadmins.

### 6) Observability
- Add structured logs/tags for system workspace runs (`workspace=alive`, `superadmin=true`).

## Required Tests
- Add `/api/sites` route tests for superadmin/non-superadmin alive visibility.
- Add `/api/automations` route tests for alive create authorization and validation.
- Extend `apps/web/lib/automation/__tests__/executor.test.ts`:
  - alive path resolution
  - credit bypass behavior
- Add `attempts.ts` / worker-pool tests for alive superadmin flags and claim-time credit-bypass re-validation.
- Extend trigger route tests for alive job flow.

## Validation Commands
- `cd apps/web && bun run test app/api/sites/__tests__/route.test.ts`
- `cd apps/web && bun run test app/api/automations/__tests__/route.test.ts`
- `cd apps/web && bun run test lib/automation/__tests__/executor.test.ts`
- `cd apps/web && bun run test app/api/automations/[id]/trigger/__tests__/route.test.ts`
- `bun run check:affected`

## Done Criteria
- Superadmins can create/run alive automations from settings.
- Non-superadmins cannot access alive automation path.
- Alive jobs execute in the alive repo (`SUPERADMIN.WORKSPACE_PATH` from server config) with superadmin tool policy.
- Site automation behavior remains unchanged.
- Regression tests enforce the above contracts.
