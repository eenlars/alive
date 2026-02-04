export const WORKTREE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,48}$/

const RESERVED_WORKTREE_SLUGS = new Set(["user", "worktrees", ".", ".."])

export function normalizeWorktreeSlug(input: string): string {
  return input.trim().toLowerCase()
}

export function validateWorktreeSlug(input: string): { valid: true; slug: string } | { valid: false; reason: string } {
  const slug = normalizeWorktreeSlug(input)

  if (!slug) {
    return { valid: false, reason: "Slug cannot be empty." }
  }

  if (!WORKTREE_SLUG_REGEX.test(slug)) {
    return { valid: false, reason: "Use lowercase letters, numbers, and hyphens (max 49 chars)." }
  }

  if (RESERVED_WORKTREE_SLUGS.has(slug)) {
    return { valid: false, reason: "That slug is reserved." }
  }

  return { valid: true, slug }
}

export function buildWorkspaceKey(workspace: string | null, worktree?: string | null): string | null {
  if (!workspace) return null
  const normalized = worktree ? normalizeWorktreeSlug(worktree) : ""
  return normalized ? `${workspace}::wt/${normalized}` : workspace
}

export function parseWorkspaceKey(key: string): { workspace: string; worktree: string | null } {
  const [workspace, worktreePart] = key.split("::wt/")
  if (!worktreePart) {
    return { workspace: key, worktree: null }
  }
  return { workspace, worktree: worktreePart || null }
}
