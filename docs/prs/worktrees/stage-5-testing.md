# Stage 5 - Testing

## API Tests (Mandatory)
For each new route:
- 401 without session
- 403 when workspace not authorized
- 400 on invalid slug or branch
- Success path
- 409 when the per-repo lock is held

## Workspace Resolution Tests
- Resolves base workspace without worktree.
- Resolves valid worktree.
- Rejects worktree with traversal (`..`).
- Rejects worktree outside worktree root.
- Rejects unknown worktree (not in `git worktree list`).

## Session Key Tests
- Base workspace and worktree do not collide.
- Worktree tab IDs are stable and deterministic.

## Recommended Test Setup
- Create a temp repo in tests with `git init` and one commit.
- Create a worktree under a temp `worktrees` folder.
- Use `runAsWorkspaceUser` in tests only if required by the helper.
- Clean up temp directories after each test run.

## Service-Level Tests (Phase 1)
- Invalid branch name returns `WORKTREE_INVALID_BRANCH`.
- Invalid `from` ref returns `WORKTREE_INVALID_FROM`.
- Non-git base workspace returns `WORKTREE_NOT_GIT`.
- Lock contention returns `WORKTREE_LOCKED`.
