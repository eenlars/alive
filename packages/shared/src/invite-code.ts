/**
 * Invite Code Generator
 *
 * Generates deterministic, URL-safe invite codes from user IDs.
 * Used by the referral system to create shareable invite links.
 *
 * @example
 * ```typescript
 * import { generateInviteCode } from "@webalive/shared"
 *
 * const code = generateInviteCode("user_abc123")
 * // Returns: "K7HTMF4WQP" (10-char deterministic code)
 * ```
 */

import { createHash } from "node:crypto"

/**
 * Unambiguous character set for invite codes.
 *
 * Excludes characters that can be visually confused:
 * - No 0 (zero) - confused with O
 * - No 1 (one) - confused with I or L
 * - No O (uppercase o) - confused with 0
 * - No I (uppercase i) - confused with 1 or L
 * - No L (uppercase L) - confused with 1 or I
 *
 * Total: 31 characters (23 letters + 8 digits)
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // 31 chars

/**
 * Generates a deterministic 10-character invite code from a user ID.
 *
 * Properties:
 * - **Deterministic**: Same userId always produces same code
 * - **URL-safe**: Only uppercase letters and digits
 * - **Unambiguous**: No visually confusable characters (0/O, 1/I/L)
 *
 * @param userId - The unique user identifier
 * @returns A 10-character uppercase alphanumeric invite code
 *
 * @remarks
 * Uses SHA-256 hash with a salt for consistent output.
 * This is NOT cryptographically secure for secrets - it's designed
 * for generating user-friendly shareable codes where the userId
 * is not sensitive information.
 */
export function generateInviteCode(userId: string): string {
  const hash = createHash("sha256").update(`${userId}alive-invite-v1`).digest("hex")

  let code = ""
  for (let i = 0; i < 10; i++) {
    const index = parseInt(hash.slice(i * 2, i * 2 + 2), 16) % ALPHABET.length
    code += ALPHABET[index]
  }

  return code
}
