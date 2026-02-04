# Stage 2 - Server API

## New Routes
- `POST /api/worktrees/create`
- `GET /api/worktrees?workspace=<domain>`
- `DELETE /api/worktrees`

## Common Auth + Resolution
- `requireSessionUser` + `verifyWorkspaceAccess` (workspace is the domain).
- Resolve base workspace via `getWorkspace({ host, body, requestId })`.
- All git operations use `runAsWorkspaceUser` on base workspace.

## POST /api/worktrees/create
**Body**
- `workspace: string` (domain)
- `slug?: string`
- `branch?: string`
- `from?: string` (branch or commit; default `HEAD`)

**Behavior**
- Validate slug/branch.
- Create worktree directory and git worktree.
- Return `{ ok: true, slug, branch, path }`.

## GET /api/worktrees
**Query**
- `workspace: string` (domain)

**Behavior**
- List worktrees (filtered to worktree root only).
- Return `{ ok: true, worktrees: [...] }`.

## DELETE /api/worktrees
**Body**
- `workspace: string` (domain)
- `slug: string`
- `deleteBranch?: boolean`

**Behavior**
- Remove worktree via service.
- Optionally delete branch.
- Return `{ ok: true }`.

## Errors
- Use `ErrorCodes` + `createErrorResponse`.
- 400 invalid slug/branch.
- 401/403 for auth failures.
- 404 for missing worktree.
