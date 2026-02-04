# Stage 5 - Testing

## API Tests (Mandatory)
For each new route:
- 401 without session
- 403 when workspace not authorized
- 400 on invalid slug/branch
- Success path

## Workspace Resolution Tests
- Resolves base workspace without worktree.
- Resolves valid worktree.
- Rejects worktree with traversal (`..`).
- Rejects worktree outside worktree root.
- Rejects unknown worktree (not in `git worktree list`).

## Session Key Tests
- Base workspace and worktree do not collide.
- Worktree tab IDs are stable and deterministic.
