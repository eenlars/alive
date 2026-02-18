# Superadmin Automations For Alive Workspace (Issue #177) - Draft Checklist

## Goal
Enable superadmin-only automations that run in `/root/alive` with superadmin tool policy, while preserving current site automation behavior.

## Chosen Strategy
Keep the existing `automation_jobs.site_id` model and add a reserved/synthetic `alive` domain target for system-workspace jobs.

## Planned Code Targets
- `apps/web/migrations/*` (reserved alive domain row)
- `apps/web/app/api/sites/route.ts`
- `apps/web/app/api/automations/route.ts`
- `apps/web/lib/automation/validation.ts`
- `packages/shared/src/stream-tools.ts` (workspace path helper)
- `apps/web/lib/automation/executor.ts`
- `apps/web/lib/automation/attempts.ts`
- `apps/web/components/automations/AutomationSidePanel.tsx`
- `apps/web/components/automations/tabs/GeneralTab.tsx`
- `apps/web/app/api/automations/[id]/trigger/route.ts`

## Scope

### 1) Reserved Alive Workspace Target
- Add/ensure a reserved `app.domains` row for `alive` on this server.
- Keep `site_id`/`org_id` schema unchanged in this issue.

### 2) API Surface
- `/api/sites`: include `alive` option for superadmins only.
- `/api/automations` create: allow `alive` site only for superadmins.
- Non-superadmin attempts must return `403`.

### 3) Execution Semantics
- `workspace === "alive"` resolves to `SUPERADMIN.WORKSPACE_PATH`.
- Bypass org credit checks for `alive` jobs only.
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
- Add worker-pool attempt tests for alive superadmin flags.
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
- Alive jobs execute in `/root/alive` with superadmin tool policy.
- Site automation behavior remains unchanged.
- Regression tests enforce the above contracts.
