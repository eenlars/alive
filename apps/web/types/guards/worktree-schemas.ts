import { z } from "zod"
import { WORKTREE_SLUG_REGEX, normalizeWorktreeSlug } from "@/features/workspace/lib/worktree-utils"

/**
 * Worktree slug validation schema
 *
 * Worktree slugs are embedded in session keys using "::" as delimiter.
 * A malformed worktree containing "::" would corrupt the key structure and
 * break parseKey(), causing 500 errors and stranded streams.
 *
 * Valid: lowercase letters, numbers, hyphens. Max 49 chars. Start with alphanumeric.
 * Examples: "feature-1", "bugfix-123", "test"
 * Invalid: "foo::bar", "UPPER", "with spaces", "..", "user"
 */
export const WorktreeSlugSchema = z
  .string()
  .transform(normalizeWorktreeSlug)
  .refine(slug => WORKTREE_SLUG_REGEX.test(slug), {
    message: "Invalid worktree slug. Use lowercase letters, numbers, and hyphens (max 49 chars).",
  })
  .refine(slug => !["user", "worktrees", ".", ".."].includes(slug), {
    message: "Reserved worktree slug.",
  })

/**
 * Optional worktree schema for API boundaries
 * Normalizes and validates when present, passes through undefined/null
 */
export const OptionalWorktreeSchema = z
  .string()
  .nullish()
  .transform(val => (val ? normalizeWorktreeSlug(val) : val))
  .refine(val => !val || WORKTREE_SLUG_REGEX.test(val), {
    message: "Invalid worktree slug. Use lowercase letters, numbers, and hyphens (max 49 chars).",
  })
  .refine(val => !val || !["user", "worktrees", ".", ".."].includes(val), {
    message: "Reserved worktree slug.",
  })

/**
 * Optional worktree schema that only allows undefined (not null)
 * Used when form data parses to undefined rather than null
 */
export const OptionalWorktreeSlugSchema = z
  .string()
  .optional()
  .transform(val => (val ? normalizeWorktreeSlug(val) : val))
  .refine(val => !val || WORKTREE_SLUG_REGEX.test(val), {
    message: "Invalid worktree slug. Use lowercase letters, numbers, and hyphens (max 49 chars).",
  })
  .refine(val => !val || !["user", "worktrees", ".", ".."].includes(val), {
    message: "Reserved worktree slug.",
  })
