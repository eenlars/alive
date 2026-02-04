# Stage 2 - Server API

## Routes and Files
- `POST /api/worktrees/create` in `apps/web/app/api/worktrees/create/route.ts`
- `GET /api/worktrees` in `apps/web/app/api/worktrees/route.ts`
- `DELETE /api/worktrees` in `apps/web/app/api/worktrees/route.ts`

## Common Auth and Resolution
- `requireSessionUser` then `verifyWorkspaceAccess` using the domain only.
- Resolve base workspace via `getWorkspace({ host, body, requestId })`.
- All git operations must run via `runAsWorkspaceUser` on the base workspace.

## POST /api/worktrees/create

### Body
- `workspace: string` domain
- `slug?: string`
- `branch?: string`
- `from?: string` branch or commit, default `HEAD`

### Behavior
- Validate `slug` and `branch` early.
- Acquire the per-site lock before any mutation.
- Create the worktree via the worktree service.
- Return `201` with `{ ok: true, slug, branch, worktreePath }`.
- `worktreePath` should be relative to `worktreeRoot` to avoid leaking absolute paths.

### Errors
- `400` invalid slug or branch.
- `409` lock held or slug already exists.
- `404` base repo not found or not a git repo.

## GET /api/worktrees

### Query
- `workspace: string` domain

### Behavior
- List worktrees via the service.
- Filter to `worktreeRoot` only.
- Return `200` with `{ ok: true, worktrees: [...] }`.

### Worktree Shape
- `{ slug, branch, head, pathRelative }`

## DELETE /api/worktrees

### Body
- `workspace: string` domain
- `slug: string`
- `deleteBranch?: boolean`

### Behavior
- Resolve the worktree and remove it.
- If `deleteBranch` is true, delete the branch after remove.
- Return `200` with `{ ok: true }`.

### Errors
- `404` worktree not found.
- `409` worktree dirty or lock held.

## Error Handling
- Use `ErrorCodes` + `createErrorResponse` for consistency.
- Ensure response includes `requestId` for debugging.
