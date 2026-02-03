import type { Variant } from "../types/config.js"

/**
 * Generate storage key following content-addressed pattern:
 * t/{tenantId}/o/{contentHash}/v/{variant}.webp
 *
 * This format ensures:
 * - Tenant isolation via prefix
 * - Content addressing for deduplication
 * - Variant support for responsive images
 * - Migration-friendly (same key across storage backends)
 */
export function generateStorageKey(tenantId: string, contentHash: string, variant: Variant): string {
  return `t/${tenantId}/o/${contentHash}/v/${variant}.webp`
}

/**
 * Parse storage key back into components
 */
export function parseStorageKey(key: string): {
  tenantId: string
  contentHash: string
  variant: string
} | null {
  const match = key.match(/^t\/([^/]+)\/o\/([^/]+)\/v\/([^.]+)\.webp$/)
  if (!match) return null

  return {
    tenantId: match[1],
    contentHash: match[2],
    variant: match[3],
  }
}
