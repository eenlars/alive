# Stage 6 - Docs

## Update Feature Docs
- `docs/features/worktrees.md` must reflect full implementation status.
- Document request fields (`workspace`, optional `worktree`, and `wt` URL param).
- Document slug rules, branch naming, and lock semantics.
- Document session scoping (`tabKey` worktree segment and `workspaceKey`).
- Document typed API patterns (`apiSchemas`, `validateRequest`, `getty/postty/delly`).

## Update Architecture Docs
- `docs/architecture/workspace-isolation.md` should include:
- Worktree root layout under each site.
- Containment checks for worktree resolution.
- Reminder that auth remains domain-based.
