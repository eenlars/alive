/**
 * Key Derivation using HKDF
 *
 * Implements proper key derivation from master key:
 * - Never use master key directly for encryption
 * - Derive unique keys per context (tenant, purpose, etc.)
 * - Support key versioning for rotation
 *
 * Uses HKDF (HMAC-based Key Derivation Function) from RFC 5869:
 * - Extract: HKDF-Extract(salt, IKM) -> PRK
 * - Expand: HKDF-Expand(PRK, info, L) -> OKM
 */

import crypto from "node:crypto"

/**
 * Key version for migration support
 * v1: Master key used directly (legacy, still supported for reading)
 * v2: HKDF-derived keys per context
 */
export type KeyVersion = 1 | 2
export const CURRENT_KEY_VERSION: KeyVersion = 2

/**
 * Context for key derivation
 * Unique keys are derived for each unique combination of context values
 */
export interface KeyDerivationContext {
  /** Tenant/user ID for tenant isolation */
  tenantId: string
  /** Purpose of the key (e.g., "oauth_tokens", "user_env_keys") */
  purpose: string
  /** Optional additional context (e.g., provider name) */
  extra?: string
}

/**
 * Fixed salt for HKDF-Extract phase
 * Using a fixed application-specific salt is acceptable for our use case
 * since we're deriving from an already-strong master key
 */
const HKDF_SALT = Buffer.from("webalive-oauth-core-v2", "utf8")

/**
 * Derives a context-specific encryption key using HKDF
 *
 * @param masterKey - 32-byte master key (AES-256)
 * @param context - Context for key derivation
 * @returns 32-byte derived key
 *
 * @example
 * ```typescript
 * const derivedKey = deriveKey(masterKey, {
 *   tenantId: "user-123",
 *   purpose: "oauth_tokens",
 *   extra: "linear"
 * })
 * ```
 */
export function deriveKey(masterKey: Buffer, context: KeyDerivationContext): Buffer {
  if (masterKey.length !== 32) {
    throw new Error(`Invalid master key length: ${masterKey.length} (expected 32 bytes)`)
  }

  // Build info string from context (used in HKDF-Expand)
  const info = buildInfoString(context)

  // Use Node.js built-in HKDF
  // hkdfSync(digest, ikm, salt, info, keylen)
  return Buffer.from(crypto.hkdfSync("sha256", masterKey, HKDF_SALT, info, 32))
}

/**
 * Builds the info string for HKDF-Expand
 * Format: "tenantId:purpose:extra" (extra is optional)
 */
function buildInfoString(context: KeyDerivationContext): Buffer {
  const parts = [context.tenantId, context.purpose]
  if (context.extra) {
    parts.push(context.extra)
  }
  return Buffer.from(parts.join(":"), "utf8")
}

/**
 * Metadata embedded in encrypted payloads for versioning and context
 */
export interface EncryptionMetadata {
  /** Key version used */
  v: KeyVersion
  /** Tenant ID (for v2 only) */
  t?: string
  /** Purpose (for v2 only) */
  p?: string
  /** Extra context (for v2 only) */
  e?: string
}

/**
 * Serialize metadata to a compact string for storage
 * Format: "v2:tenantId:purpose:extra" or "v1"
 */
export function serializeMetadata(meta: EncryptionMetadata): string {
  if (meta.v === 1) {
    return "v1"
  }
  const parts = [`v${meta.v}`, meta.t || "", meta.p || ""]
  if (meta.e) {
    parts.push(meta.e)
  }
  return parts.join(":")
}

/**
 * Parse metadata from storage format
 */
export function parseMetadata(str: string): EncryptionMetadata {
  if (!str || str === "v1" || str === "") {
    return { v: 1 }
  }

  const parts = str.split(":")
  const version = parts[0]

  if (version === "v2") {
    return {
      v: 2,
      t: parts[1] || undefined,
      p: parts[2] || undefined,
      e: parts[3] || undefined,
    }
  }

  // Unknown version, assume v1 for backward compatibility
  return { v: 1 }
}

/**
 * Check if metadata matches expected context
 * Used to verify we're using the right key for decryption
 */
export function metadataMatchesContext(meta: EncryptionMetadata, context: KeyDerivationContext): boolean {
  if (meta.v === 1) {
    // v1 has no context, always matches (uses master key)
    return true
  }

  return (
    meta.t === context.tenantId && meta.p === context.purpose && (meta.e || undefined) === (context.extra || undefined)
  )
}

/**
 * Derive key for a given version and context
 *
 * @param masterKey - Master key
 * @param version - Key version
 * @param context - Context (ignored for v1)
 * @returns Encryption key
 */
export function getKeyForVersion(masterKey: Buffer, version: KeyVersion, context?: KeyDerivationContext): Buffer {
  if (version === 1) {
    // v1: Use master key directly (legacy)
    return masterKey
  }

  if (!context) {
    throw new Error("Key derivation context required for v2 keys")
  }

  return deriveKey(masterKey, context)
}
