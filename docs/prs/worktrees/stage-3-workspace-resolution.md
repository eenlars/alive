# Stage 3 - Workspace Resolution and Tooling

## Request Shape
- Continue sending `workspace: <domain>` for auth.
- Add optional `worktree: <slug>` in request bodies and query params where relevant.

## Workspace Resolution Changes
- Update the resolver used by API routes to:
  1. Resolve the base workspace from the domain as today.
  2. If `worktree` is present, resolve to `worktrees/<slug>` via the worktree service.
  3. Return the resolved worktree path as the effective workspace root.

## Containment Rules
- `worktree` must resolve inside `/srv/webalive/sites/<domain>/worktrees`.
- Verify the target is listed in `git worktree list --porcelain`.
- Use `realpath` and `ensurePathWithinWorkspace` before returning.

## Call Sites to Update
- File operation routes under `apps/web/app/api/files/*`.
- Claude streaming and polling routes under `apps/web/app/api/claude/*`.
- Image upload and delete routes, if they resolve workspace paths.
- Any helper that builds `WorkspaceResult` from request bodies.

## Tooling Impacts
- Workspace root passed to SDK tooling should be the resolved worktree path.
- File operations must use the resolved root for containment checks.
- Session and concurrency keys must include worktree to avoid collisions.
