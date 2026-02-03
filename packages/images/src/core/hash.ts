import crypto from "node:crypto"

/**
 * Generate content-addressed hash (SHA-256)
 * First 16 characters = 64 bits of entropy
 *
 * Benefits:
 * 1. Idempotency: Same content = same hash
 * 2. Deduplication: Easy to detect duplicates
 * 3. Cache-friendly: Immutable content identifier
 */
export function generateContentHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16)
}
