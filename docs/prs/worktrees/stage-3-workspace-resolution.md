# Stage 3 - Workspace Resolution + Tooling

## Request Shape
- Continue sending `workspace: <domain>` for auth.
- Add optional `worktree: <slug>` in request bodies.

## Server Resolution Changes
- Update `getWorkspace()` to:
  1. Resolve base workspace from domain as today.
  2. If `worktree` present, resolve to `worktrees/<slug>` using worktree module.
  3. Return the worktree path as the effective workspace for file operations.

## Containment Rules
- `worktree` must resolve inside `/srv/webalive/sites/<domain>/worktrees`.
- Verify target is a listed worktree (`git worktree list --porcelain`).
- Use `realpath` + prefix checks before returning.

## Tooling Impacts
- File operations, image upload/delete, and Claude stream should accept optional `worktree`.
- Workspace root passed to SDK/tooling should be the resolved worktree path.
- Session/concurrency should incorporate worktree to avoid collisions (see Stage 4).
