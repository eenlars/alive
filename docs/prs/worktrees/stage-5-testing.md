# Stage 5 - Testing

## API Tests (Mandatory)
- 401 without session.
- 401 or 403 when workspace not authorized.
- 400 on invalid slug, branch, or `from` ref.
- 404 when base workspace is not a git repo or worktree not found.
- 409 when the per-repo lock is held.
- 409 when branch is already checked out (`WORKTREE_BRANCH_IN_USE`).
- 409 when worktree path already exists (`WORKTREE_PATH_EXISTS`).
- Success path for create, list, and delete.

## Worktree Service Tests
- Invalid branch name returns `WORKTREE_INVALID_BRANCH`.
- Invalid `from` ref returns `WORKTREE_INVALID_FROM`.
- Non-git base workspace returns `WORKTREE_NOT_GIT`.
- Base workspace that is itself a worktree returns `WORKTREE_BASE_INVALID`.
- Lock contention returns `WORKTREE_LOCKED`.
- Branch already checked out returns `WORKTREE_BRANCH_IN_USE`.
- Branch delete blocked when it matches base branch.

## Workspace Resolution Tests
- Resolves base workspace without worktree.
- Resolves valid worktree.
- Rejects empty or invalid worktree slug.
- Rejects worktree outside worktree root.
- Rejects worktree not listed in `git worktree list`.
- Superadmin workspace rejects worktrees.

## Session and Workspace Key Tests
- `tabKey` includes `wt/<slug>` when worktree is present.
- `parseKey` accepts both 4- and 5-segment formats.
- `buildWorkspaceKey` and `parseWorkspaceKey` round-trip correctly.

## Client Plumbing Tests (Recommended)
- File routes pass `worktree` through to `getWorkspace` when provided.
- Stream cancel/reconnect include `worktree` in the tab key.
- Image list accepts `worktree` query param.

## Recommended Commands
- `cd apps/web && bun run test:unit -- <test files>`
