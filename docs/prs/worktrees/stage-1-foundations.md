# Stage 1 - Foundations

## Goals
- Add Git worktree support per website workspace with strong containment, ownership correctness, and zero cross-tenant leakage.
- Keep auth tied to the site domain (no new JWT scopes or env vars).

## Assumptions
- Base repo for a site is `/srv/webalive/sites/<domain>/user` and is a Git repo.
- Worktrees live under `/srv/webalive/sites/<domain>/worktrees/<slug>`.

## Canonical Paths
- Base workspace: `/srv/webalive/sites/<domain>/user`
- Worktree root: `/srv/webalive/sites/<domain>/worktrees`
- Worktree path: `<worktreeRoot>/<slug>`

## Slug + Branch Rules
- Slug: `[a-z0-9][a-z0-9-]{0,48}`
- Default branch: `worktree/<slug>`
- Collision: suffix with `-<timestamp>`

## Concurrency + Safety
- Use a per-site lock file to serialize `git worktree` mutations.
  - Suggested: `<siteRoot>/.git/bridge-worktree.lock`
- Use `runAsWorkspaceUser` for all git commands so ownership is correct.
- All paths resolved with `realpath` + containment checks.

## New Server Module
Create `apps/web/features/worktrees/lib/worktrees.ts` with:
- `listWorktrees(baseWorkspacePath)`
  - Uses `git worktree list --porcelain`
  - Filters to our worktree root
- `createWorktree({ baseWorkspacePath, slug, branch, from })`
  - Validates slug
  - Ensures branch name safe
  - `git worktree add <path> -b <branch> <from>`
- `removeWorktree({ baseWorkspacePath, slug, deleteBranch })`
  - `git worktree remove <path>`
  - Optional branch deletion
- `resolveWorktreePath(baseWorkspacePath, slug)`
  - Ensures worktree exists in `git worktree list`
  - Ensures worktree path is inside `worktreeRoot`
