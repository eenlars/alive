# Worktrees

**Status**: Planned
**Feature**: Git worktrees per site workspace for parallel branches

## Overview

Worktrees allow a single site repo to have multiple checked out branches at once. Each worktree lives under the same site root and is isolated through the existing workspace containment checks. Authentication remains domain-based, so a user who can access a domain can access its worktrees.

## Path Layout

```
/srv/webalive/sites/<domain>/
├── user/                  # Base repo
└── worktrees/
    └── <slug>/            # Worktree checkout
```

## Slug and Branch Rules

- Slug regex: `^[a-z0-9][a-z0-9-]{0,48}$`
- Default branch: `worktree/<slug>`
- Branch validation uses `git check-ref-format --branch`.
- Collisions are resolved with a timestamp suffix.

## API

### Create

`POST /api/worktrees/create`

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

`DELETE /api/worktrees`

Body:
- `workspace` domain
- `slug`
- `deleteBranch` optional

Returns:
- `{ ok: true }`

## UI

- Worktree switcher shows current worktree and list.
- Create modal validates slug and optionally sets base branch.
- Switching creates a new tabId to avoid session collisions.

## Security and Containment

- Worktrees must be inside `/srv/webalive/sites/<domain>/worktrees`.
- Resolution uses `realpath` and `ensurePathWithinWorkspace`.
- Targets must appear in `git worktree list --porcelain`.

## Limits

- Worktrees are limited to the same repo as the base workspace.
- Worktree paths are not exposed as absolute paths.
- No new auth scopes are introduced.
