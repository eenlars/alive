# Stage 1 - Foundations

## Goals
- Add Git worktree support per website workspace with strong containment, ownership correctness, and zero cross-tenant leakage.
- Keep auth tied to the site domain. No new JWT scopes and no new env vars.

## Non-goals
- No changes to authentication or workspace access rules.
- No new database schema required in this stage.

## Path Model
- Base workspace path: `/srv/webalive/sites/<domain>/user`
- Site root: `path.dirname(baseWorkspacePath)`
- Worktree root: `/srv/webalive/sites/<domain>/worktrees`
- Worktree path: `<worktreeRoot>/<slug>`

## Slug Rules
- Allowed: `^[a-z0-9][a-z0-9-]{0,48}$`
- Must be lowercase.
- Reject reserved slugs like `user`, `worktrees`, and `.` or `..`.

## Branch Rules
- Validate branch refs with `git check-ref-format --branch <branch>`.
- Default branch name: `worktree/<slug>`.
- If branch exists, append a timestamp suffix `worktree/<slug>-YYYYMMDD-HHMM` (UTC).

## Preconditions
- `baseWorkspacePath` must exist and be a git repo.
- Verify with `.git` existence plus `git -C <baseWorkspacePath> rev-parse --git-dir`.
- Return a clear `WORKTREE_NOT_GIT` error when the base workspace is not a repo.
- Ensure `worktreeRoot` exists and is owned by the workspace user (chown to base workspace uid/gid when created).

## Concurrency and Safety
- Use a per-repo lock to serialize `git worktree` mutations.
- Lock file: `<baseWorkspacePath>/.git/bridge-worktree.lock`.
- Return `WORKTREE_LOCKED` on contention.
- Acquire with `fs.open(lock, "wx")` and keep the fd open until done.
- Store `pid` and timestamp in the lock for debugging.
- If the lock exists, return a 409 so the caller can retry.

## Worktree Service Module
Create `apps/web/features/worktrees/lib/worktrees.ts` with:

### `listWorktrees(baseWorkspacePath)`
- Runs `git worktree list --porcelain` via `runAsWorkspaceUser`.
- Parses blocks into `{ path, branch, head, isBare }`.
- Filters to `worktreeRoot` only. Do not include the base workspace.
- If `worktreeRoot` does not exist, return an empty list.

### `resolveWorktreePath(baseWorkspacePath, slug)`
- Builds `<worktreeRoot>/<slug>` and resolves realpath.
- Uses `ensurePathWithinWorkspace` on `worktreeRoot`.
- Verifies the real path exists in `git worktree list --porcelain`.
- Returns the real path only if it is a listed worktree.

### `createWorktree({ baseWorkspacePath, slug, branch, from })`
- Validates slug and branch.
- If `slug` is empty, generate `wt-YYYYMMDD-HHMM`.
- Default `from` is the current HEAD (`git rev-parse --abbrev-ref HEAD`).
- Acquire the lock before any git mutation.
- Create the worktree with `git worktree add <path> -b <branch> <from>`.

### `removeWorktree({ baseWorkspacePath, slug, deleteBranch })`
- Resolves the path with `resolveWorktreePath`.
- Optionally reject dirty worktrees unless `force` is explicitly allowed later.
- Run `git worktree remove <path>`.
- If `deleteBranch` is true, delete with `git branch -D <branch>`.

## Ownership and Execution
- All git commands must run via `runAsWorkspaceUser` so new files are owned by the workspace user.
- Always pass `-C <baseWorkspacePath>` to ensure operations target the correct repo.
