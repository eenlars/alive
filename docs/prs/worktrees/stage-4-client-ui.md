# Stage 4 - Client UI and Session Scoping

## UI Flow
- Add a worktree switcher near the workspace selector.
- Provide actions: Create, Switch, Remove.
- Replace the current toast in `handleNewWorktree` with a modal.

### Create Modal
- Slug input with live validation and auto-suggest.
- Optional base branch input. Default to the current branch if available.
- Submit calls `POST /api/worktrees` and shows progress.
  - Use typed client: `postty("worktrees/create", body, undefined, "/api/worktrees")`.

### After Create
- Switch to the new worktree immediately.
- Start a new tab group to avoid session collisions.

## Store Updates
- Add `currentWorktree` to the workspace store.
- Persist by workspace domain so each site has its own selection.
- Include `worktree` in all requests that resolve a workspace path.

## Typed API Calls (Client)
- List: `getty("worktrees", undefined, "/api/worktrees?workspace=<domain>")`
- Create: `postty("worktrees/create", body, undefined, "/api/worktrees")`
- Delete: `delly("worktrees/delete", undefined, "/api/worktrees?workspace=<domain>&slug=<slug>&deleteBranch=true")`

## Session and Concurrency Scoping
Goal: avoid collisions between base workspace and worktrees.

Option A (lighter, recommended)
- Prefix `tabId` with `wt/<slug>/` when a worktree is selected.
- Keep IAM session schema unchanged.

Option B (cleaner, heavier)
- Extend `tabKey` to include `worktree` explicitly.
- Requires schema and session store migration.

## Edge Cases
- Removing the active worktree should fall back to base workspace.
- Switching worktrees should reset conversation context and create a new tabId.
