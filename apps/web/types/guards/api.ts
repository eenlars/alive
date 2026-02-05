import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PATHS } from "@webalive/shared"
import bcrypt from "bcrypt"
import { z } from "zod"
import type { DomainPasswords } from "@/types/domain"

// Re-export schemas for backward compatibility
export { WorktreeSlugSchema, OptionalWorktreeSchema } from "./worktree-schemas"
import { OptionalWorktreeSchema } from "./worktree-schemas"

/**
 * API request validation and schema guards
 */

/**
 * Validate API key format
 * Valid Anthropic keys start with "sk-ant-" and are reasonably long
 */
function isValidApiKeyFormat(key: string): boolean {
  if (!key) return false
  // Must start with sk-ant- prefix
  if (!key.startsWith("sk-ant-")) return false
  // Must be at least sk-ant-X (7 + 1 = 8 chars)
  if (key.length < 20) return false
  // Must not contain spaces or newlines
  if (/\s/.test(key)) return false
  return true
}

/**
 * Zod schema for Claude API request body
 * IMPORTANT: All fields used by backend must be defined here
 */
export const BodySchema = z.object({
  message: z.string().min(1),
  workspace: z.string().optional(),
  worktree: OptionalWorktreeSchema, // Validated to prevent session key corruption
  conversationId: z.string().uuid().optional(), // Optional grouping layer (future: git branches)
  tabGroupId: z.string().uuid(), // Tab group ID - groups tabs in sidebar, part of lock key
  tabId: z.string().uuid(), // Tab ID - primary session key (maps to Claude SDK session)
  apiKey: z
    .string()
    .refine(
      key => !key || isValidApiKeyFormat(key),
      "Invalid API key format. Must start with 'sk-ant-' and be at least 20 characters.",
    )
    .optional(),
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

function getDomainPasswordsPath(): string {
  // PRODUCTION: Use persistent location outside of git and build process
  // This ensures the file survives deployments and doesn't require rebuilds
  const persistentPath = PATHS.REGISTRY_PATH

  // Always prefer persistent location if it exists
  if (existsSync(persistentPath)) {
    return persistentPath
  }

  // Fallback paths for development/testing
  const devPaths = [join(process.cwd(), "domain-passwords.json"), join(PATHS.STREAM_ROOT, "domain-passwords.json")]

  for (const path of devPaths) {
    if (existsSync(path)) {
      console.log("Found domain passwords at:", path)
      return path
    }
  }

  console.log("Domain passwords file not found, using persistent path:", persistentPath)
  return persistentPath // Return persistent path for creation
}

/**
 * Load port registry from domain-passwords.json
 *
 * Only used for port assignment lookups. All user/auth data is in Supabase.
 *
 * @returns Port registry object (domain → {port, createdAt})
 */
export function loadDomainPasswords(): DomainPasswords {
  try {
    const filePath = getDomainPasswordsPath()
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, "utf8"))
    }
  } catch (error) {
    console.warn("Failed to read domain passwords file:", error)
  }
  return {}
}
