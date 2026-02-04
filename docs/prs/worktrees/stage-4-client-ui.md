# Stage 4 - Client UI + Session Scoping

## UI Flow
- Replace the current toast in `handleNewWorktree` with a modal:
  - Name/slug input (auto-suggest from project name + timestamp).
  - Optional base branch selector.
- After creation, switch to the new worktree and open a fresh tab group.

## Store Updates
- Add `currentWorktree` to workspace store.
- Persist to localStorage with workspace context.
- Ensure `worktree` is included in requests (Claude + file ops).

## Session/Lock Scoping
Goal: avoid collisions between base workspace and worktrees.

Option A (lighter):
- Prefix `tabId` with `wt/<slug>/` when worktree selected.
- No schema changes in IAM sessions.

Option B (cleaner, heavier):
- Extend `tabKey` to include `worktree` explicitly.
- Requires schema + session store updates.

## Open Decision
- Should new worktree auto-switch immediately, or just be created and left inactive?
