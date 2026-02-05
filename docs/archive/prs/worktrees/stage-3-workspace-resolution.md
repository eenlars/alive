# Stage 3 - Workspace Resolution and Tooling

## Request Shape
- Keep `workspace` as the domain for auth and access checks.
- Optional `worktree` selects a worktree under `/worktrees/<slug>` for file/tool operations.
- For GET/DELETE routes, read `worktree` from the query string.
- For multipart/form-data (uploads), include `worktree` as a form field.
- Omit `worktree` when using the base workspace.

## Resolution Flow
- `getWorkspace` in `apps/web/features/chat/lib/workspaceRetriever.ts` is the single entry point and is async.
- `resolveWorkspace` in `apps/web/features/workspace/lib/workspace-utils.ts` wraps `getWorkspace` and adds CORS headers.
- Resolution steps:
- Step 1: resolve base workspace from the domain as today.
- Step 2: if `worktree` is provided, call `resolveWorktreePath(baseWorkspacePath, slug)`.
- Step 3: return the resolved worktree path as the effective workspace root.

## Validation and Error Mapping
- Reject non-string or empty `worktree` with `WORKTREE_INVALID_SLUG`.
- Worktree errors map to standard `ErrorCodes` via `createErrorResponse`:
- `WORKTREE_INVALID_SLUG` → 400
- `WORKTREE_NOT_FOUND` → 404
- `WORKTREE_NOT_GIT` → 404
- `WORKTREE_BASE_INVALID` → 400
- `WORKTREE_LOCKED` → 409
- Superadmin Bridge workspace does not support worktrees. Return `WORKTREE_INVALID_SLUG` with a clear reason.

## Containment Rules
- `resolveWorktreePath` must:
- `realpath` the worktree root and target path.
- Use `ensurePathWithinWorkspace()` against the worktree root (this throws on invalid paths; for boolean checks, use `isPathWithinWorkspace()`).
- Confirm the target exists in `git worktree list --porcelain`.

## Codebase Patterns (Use These)
- Generate a request id with `generateRequestId()` and include it in error responses.
- For typed JSON bodies, use `handleBody()` from `apps/web/lib/api/server.ts` and return via `alrighty()`.
- For auth + workspace access, use `getSessionUser()` + `verifyWorkspaceAccess()` then `getWorkspace()`.
- For endpoints that need CORS, call `resolveWorkspace()` so errors include CORS headers.
- Update `BodySchema` in `apps/web/types/guards/api.ts` to include `worktree` for Claude stream payloads.

## Call Sites to Update
- File routes: `apps/web/app/api/files/route.ts`, `read`, `upload`, `delete`.
- Image routes: `apps/web/app/api/images/list`, `upload`, `delete`.
- Stream routes: `apps/web/app/api/claude/stream/route.ts`, `stream/cancel`, `stream/reconnect`.
- Workspace verification and OCR: `apps/web/app/api/verify`, `apps/web/app/api/ocr`.
- Any request that resolves a workspace root must pass `worktree` into `getWorkspace` or `resolveWorkspace`.

## Edge Cases
- If `workspace` is missing, return `WORKSPACE_MISSING` even if `worktree` is present.
- Auth remains domain-based. `worktree` must not affect access checks.
- If `worktree` resolves outside the worktree root or is not in `git worktree list`, return `WORKTREE_NOT_FOUND`.
