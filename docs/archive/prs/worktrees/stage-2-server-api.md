# Stage 2 - Server API

## Routes and Files
- Single route file: `apps/web/app/api/worktrees/route.ts`.
- Handle `GET`, `POST`, and `DELETE` in that file to reduce boilerplate.

## Common Auth and Resolution
- Use `getSessionUser()` then `verifyWorkspaceAccess()` with the domain only.
- Resolve base workspace via `getWorkspace({ host, body, requestId })`.
- All git operations must run via `runAsWorkspaceUser` on the base workspace.

## Type-Safe API Pattern (Required)
- Define schemas in `apps/web/lib/api/schemas.ts`:
- `worktrees` (GET)
- `worktrees/create` (POST)
- `worktrees/delete` (DELETE)
- Use `handleBody` + `isHandleBodyError` for POST bodies.
- Return success responses via `alrighty(endpoint, payload)` to enforce schema.
- Errors should use `createErrorResponse(ErrorCodes.*)` or `structuredErrorResponse(ErrorCodes.*)`.
- Client calls should use typed helpers from `apps/web/lib/api/api-client.ts`.
- Use `validateRequest(endpoint, payload)` before `postty`.
- Catch `ApiError` for user-facing error messages.
- For server-side typing, use `Res<"worktrees">` and `Res<"worktrees/create">`.
- Reference: `apps/web/lib/api/README.md`.

## POST /api/worktrees

### Body
- `workspace: string` domain
- `slug?: string`
- `branch?: string`
- `from?: string` branch or commit, default `HEAD`

### Behavior
- Validate `slug` and `branch` early.
- Acquire the per-repo lock before any mutation.
- Create the worktree via the worktree service.
- Return `201` with `{ ok: true, slug, branch, worktreePath }`.
- `worktreePath` should be relative to `worktreeRoot` to avoid leaking absolute paths.

### Errors
- `400` invalid slug/branch/from (`WORKTREE_INVALID_SLUG`, `WORKTREE_INVALID_BRANCH`, `WORKTREE_INVALID_FROM`).
- `404` base repo not found or `WORKTREE_NOT_GIT`.
- `409` lock held or conflicts (`WORKTREE_LOCKED`, `WORKTREE_EXISTS`, `WORKTREE_BRANCH_IN_USE`, `WORKTREE_PATH_EXISTS`).
- `400` when base path is not a repo root (`WORKTREE_BASE_INVALID`).

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

### Query
- `workspace: string` domain
- `slug: string`
- `deleteBranch?: boolean`

### Behavior
- Resolve the worktree and remove it.
- If `deleteBranch` is true, delete the branch after remove.
- Return `200` with `{ ok: true }`.

### Errors
- `404` worktree not found.
- `409` worktree dirty/locked/branch delete blocked (`WORKTREE_DIRTY`, `WORKTREE_LOCKED`, `WORKTREE_DELETE_BRANCH_BLOCKED`).
- `400` branch delete requested for detached worktree (`WORKTREE_BRANCH_UNKNOWN`).

## Error Handling
- Use `ErrorCodes` with `createErrorResponse` or `structuredErrorResponse`.
- Include `requestId` on error responses when available.
