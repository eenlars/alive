import bcrypt from "bcrypt"
import { z } from "zod"

// Re-export schemas for backward compatibility
export { OptionalWorktreeSchema, WorktreeSlugSchema } from "./worktree-schemas"

import { OptionalWorktreeSchema } from "./worktree-schemas"

/**
 * API request validation and schema guards
 */

/**
 * Zod schema for Claude API request body
 * IMPORTANT: All fields used by backend must be defined here
 */
export const BodySchema = z.object({
  message: z.string().min(1),
  workspace: z.string().optional(),
  // Keep explicit .optional() here for object-shape clarity after Zod v4 migration.
  // OptionalWorktreeSchema is nullish internally, but this call documents field optionality at the boundary.
  worktree: OptionalWorktreeSchema.optional(), // Validated to prevent session key corruption
  conversationId: z.string().uuid().optional(), // Optional grouping layer (future: git branches)
  tabGroupId: z.string().uuid(), // Tab group ID - groups tabs in sidebar, part of lock key
  tabId: z.string().uuid(), // Tab ID - primary session key (maps to Claude SDK session)
  model: z.string().optional(),
  // Optional fields for system prompt context
  projectId: z.string().optional(),
  userId: z.string().optional(),
  additionalContext: z.string().optional(),
  // Image paths to fetch and include for Claude to analyze
  // Can be relative paths (/_images/...) or absolute URLs
  analyzeImageUrls: z.array(z.string().min(1)).optional(),
  // Plan mode: Claude can only read/explore, not modify files
  // When enabled, permissionMode is set to 'plan' in the SDK
  planMode: z.boolean().optional(),
  // Resume session at a specific message UUID (for message deletion/editing)
  // When set, the SDK resumes from this message, excluding all messages after it
  resumeSessionAt: z.string().uuid().optional(),
})

export type ValidatedBody = z.infer<typeof BodySchema>

/**
 * Zod schema for login request
 */
export const LoginSchema = z.object({
  passcode: z.string().optional(),
  workspace: z.string().optional(),
})

export type LoginRequest = z.infer<typeof LoginSchema>

const SALT_ROUNDS = 12

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS)
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}
