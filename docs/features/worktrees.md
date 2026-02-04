# Worktrees

**Status**: Implemented (stages 1–6)
**Feature**: Git worktrees per site workspace for parallel branches

## Overview
Worktrees allow a single site repo to have multiple checked out branches at once. Each worktree lives under the same site root and is isolated through the existing workspace containment checks. Authentication remains domain-based, so a user who can access a domain can access its worktrees.

## Request Fields
- `workspace` remains the domain for auth and access checks.
- Optional `worktree` selects a worktree under `/worktrees/<slug>`.
- For multipart uploads, include `worktree` as a form field.
- Client URL param `wt=<slug>` mirrors the selected worktree in the UI.

## Path Layout
```
/srv/webalive/sites/<domain>/
├── user/                  # Base repo
└── worktrees/
    └── <slug>/            # Worktree checkout
```

## Slug and Branch Rules
- Slug regex: `^[a-z0-9][a-z0-9-]{0,48}$`.
- Reserved slugs like `user`, `worktrees`, `.`, `..` are rejected.
- Default slug when omitted: `wt-YYYYMMDD-HHMM` (UTC).
- Default branch: `worktree/<slug>`.
- Branch validation uses `git check-ref-format --branch`.
- Collisions or branch-in-use are resolved with a timestamp suffix (and `-2`, `-3` if needed).

## API

### Create
`POST /api/worktrees`

Body:
- `workspace` domain
- `slug` optional
- `branch` optional
- `from` optional (branch or commit)

Returns:
- `{ ok: true, slug, branch, worktreePath }`

### List
`GET /api/worktrees?workspace=<domain>`

Returns:
- `{ ok: true, worktrees: [{ slug, branch, head, pathRelative }] }`

### Remove
`DELETE /api/worktrees?workspace=<domain>&slug=<slug>&deleteBranch=true`

Returns:
- `{ ok: true }`

## UI
- Worktree switcher shows base vs worktree selection, list, create, and remove.
- Create uses client-side slug validation and typed API calls.
- Selection is persisted per workspace in `workspaceStore`.
- URL param `wt=<slug>` stays in sync with selection.
- Tab state is isolated by `workspaceKey` and a new tab group is created when none exists for the selected worktree.

## Session Scoping
- Session keys include worktree when selected:
- Base: `userId::workspace::tabGroupId::tabId`
- Worktree: `userId::workspace::wt/<slug>::tabGroupId::tabId`
- Client storage uses `workspaceKey` (`workspace::wt/<slug>`) to isolate tabs and conversations per worktree.

## Security and Containment
- Base path must be a git repo and `.git` must be a directory.
- Worktrees must be inside `/srv/webalive/sites/<domain>/worktrees`.
- Resolution uses `realpath` and `ensurePathWithinWorkspace`.
- Targets must appear in `git worktree list --porcelain`.

## Concurrency
- Worktree mutations use a per-repo lock at `.git/bridge-worktree.lock`.
- Lock contention returns `WORKTREE_LOCKED` (409).

## Error Codes (Service)
- `WORKTREE_NOT_GIT` when the base workspace is not a git repo.
- `WORKTREE_BASE_INVALID` when the base path is not a repo root (e.g., a worktree path).
- `WORKTREE_INVALID_SLUG` for invalid or reserved slugs.
- `WORKTREE_INVALID_BRANCH` for invalid branch names.
- `WORKTREE_INVALID_FROM` for invalid base refs.
- `WORKTREE_LOCKED` when a worktree lock is held.
- `WORKTREE_EXISTS` when a worktree slug already exists.
- `WORKTREE_PATH_EXISTS` when the worktree path already exists on disk.
- `WORKTREE_BRANCH_IN_USE` when a branch is already checked out by another worktree.
- `WORKTREE_DIRTY` when removing a dirty worktree without override.
- `WORKTREE_BRANCH_UNKNOWN` when deleting a detached worktree branch.
- `WORKTREE_DELETE_BRANCH_BLOCKED` when refusing to delete the base branch.

## Typed API Pattern
- Define schemas in `apps/web/lib/api/schemas.ts` for:
- `worktrees` (GET)
- `worktrees/create` (POST)
- `worktrees/delete` (DELETE)
- Server: use `handleBody` and `alrighty`.
- Client: use `validateRequest` with `getty`, `postty`, `delly` and `pathOverride`.
