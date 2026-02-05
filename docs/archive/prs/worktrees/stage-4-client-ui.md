# Stage 4 - Client UI and Session Scoping

## UI Entry Point
- Render `WorktreeSwitcher` next to `WorkspaceSwitcher` in `WorkspaceInfoBar`.
- Hide the worktree UI for the superadmin Bridge workspace.

## Create Flow
- Validate the slug client-side with `validateWorktreeSlug` from `worktree-utils`.
- Optional `branch` and `from` inputs. Omit empty values so server defaults apply.
- Use typed API calls:
- `validateRequest("worktrees/create", payload)`
- `postty("worktrees/create", payload, undefined, "/api/worktrees")`
- On success, switch to the new worktree and close the modal.
- The tab store is keyed by `workspaceKey`. If no tabs exist for that key, it auto-creates a new tab group.

## List and Remove
- List via `getty("worktrees", undefined, "/api/worktrees?workspace=<domain>")`.
- Remove via `delly("worktrees/delete", undefined, "/api/worktrees?workspace=<domain>&slug=<slug>")`.
- Removal defaults to keeping the branch for safety.
- If the active worktree is removed, fall back to base (`worktree = null`).

## State and URL
- Persist selection per workspace in `workspaceStore.currentWorktreeByWorkspace`.
- Derive `workspaceKey` with `buildWorkspaceKey(workspace, worktree)` using the `wt/<slug>` segment.
- Sync selection to the URL query param `wt` via `useQueryState(QUERY_KEYS.worktree)`.

## Request Plumbing
- When a worktree is selected, include `worktree` in:
- Stream payloads and recovery: `claude/stream`, `stream/cancel`, `stream/reconnect`.
- File operations: list, read, upload, delete.
- Image operations: list, upload, delete.
- Verification and OCR routes.
- Attachment uploads for analysis.
- When on base workspace, omit `worktree` (send `undefined`).

## Error Handling
- Use `ApiError` from `api-client` to show server error messages.
- Show inline errors inside the modal for create/remove failures.
