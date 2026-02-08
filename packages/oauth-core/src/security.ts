/**
 * Security Layer - AES-256-GCM Encryption/Decryption
 *
 * Uses AES-256-GCM (Galois/Counter Mode) for authenticated encryption:
 * - 256-bit key (32 bytes)
 * - 96-bit IV (12 bytes) - random per encryption
 * - 128-bit authentication tag (16 bytes)
 *
 * Supports two key versions:
 * - v1: Master key used directly (legacy, for reading old data)
 * - v2: HKDF-derived keys per context (tenant, purpose)
 *
 * Output format is Postgres bytea hex format: \x[hex_string]
 */

import crypto from "node:crypto"
import { getMasterKey } from "./config"
import {
  CURRENT_KEY_VERSION,
  type EncryptionMetadata,
  getKeyForVersion,
  type KeyDerivationContext,
  parseMetadata,
  serializeMetadata,
} from "./key-derivation"
import type { EncryptedPayload } from "./types"

/**
 * Extended payload that includes key version metadata
 */
export interface EncryptedPayloadV2 extends EncryptedPayload {
  /** Key version metadata (e.g., "v2:tenantId:purpose") */
  keyMeta?: string
}

export class Security {
  /**
   * Encrypts plaintext string using derived key (v2)
   *
   * @param plaintext - String to encrypt
   * @param context - Key derivation context for tenant isolation
   * @returns Encrypted payload with ciphertext, IV, auth tag, and key metadata
   */
  static encryptWithContext(plaintext: string, context: KeyDerivationContext): EncryptedPayloadV2 {
    const masterKey = getMasterKey()
    const encryptionKey = getKeyForVersion(masterKey, CURRENT_KEY_VERSION, context)
    const iv = crypto.randomBytes(12) // 96-bit IV for GCM

    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv)

    // Encrypt the plaintext
    let encrypted = cipher.update(plaintext, "utf8")
    encrypted = Buffer.concat([encrypted, cipher.final()])

    // Get the authentication tag
    const authTag = cipher.getAuthTag()

    // Build metadata
    const meta: EncryptionMetadata = {
      v: CURRENT_KEY_VERSION,
      t: context.tenantId,
      p: context.purpose,
      e: context.extra,
    }

    // Format as Postgres bytea hex: \x[hex_string]
    return {
      ciphertext: `\\x${encrypted.toString("hex")}`,
      iv: `\\x${iv.toString("hex")}`,
      authTag: `\\x${authTag.toString("hex")}`,
      keyMeta: serializeMetadata(meta),
    }
  }

  /**
   * Encrypts plaintext string to Postgres bytea format (v1 legacy)
   * DEPRECATED: Use encryptWithContext for new data
   *
   * @param plaintext - String to encrypt
   * @returns Encrypted payload with ciphertext, IV, and auth tag
   */
  static encrypt(plaintext: string): EncryptedPayload {
    const masterKey = getMasterKey()
    const iv = crypto.randomBytes(12) // 96-bit IV for GCM

    const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv)

    // Encrypt the plaintext
    let encrypted = cipher.update(plaintext, "utf8")
    encrypted = Buffer.concat([encrypted, cipher.final()])

    // Get the authentication tag
    const authTag = cipher.getAuthTag()

    // Format as Postgres bytea hex: \x[hex_string]
    return {
      ciphertext: `\\x${encrypted.toString("hex")}`,
      iv: `\\x${iv.toString("hex")}`,
      authTag: `\\x${authTag.toString("hex")}`,
    }
  }

  /**
   * Decrypts Postgres bytea format back to plaintext
   * Handles both v1 (master key) and v2 (derived key) encrypted data
   *
   * @param ciphertext - Encrypted data (bytea hex format)
   * @param iv - Initialization vector (bytea hex format)
   * @param authTag - Authentication tag (bytea hex format)
   * @param keyMeta - Optional key version metadata
   * @param context - Optional context for v2 decryption
   * @returns Decrypted plaintext string
   * @throws Error if decryption fails or authentication fails
   */
  static decrypt(
    ciphertext: string,
    iv: string,
    authTag: string,
    keyMeta?: string,
    context?: KeyDerivationContext,
  ): string {
    const masterKey = getMasterKey()

    // Parse metadata to determine key version
    const meta = parseMetadata(keyMeta || "")

    // Get the right key based on version
    let encryptionKey: Buffer
    if (meta.v === 1 || !keyMeta) {
      // v1 or no metadata: use master key directly
      encryptionKey = masterKey
    } else {
      // v2: derive key from context (use stored metadata or provided context)
      const derivationContext: KeyDerivationContext = context || {
        tenantId: meta.t || "",
        purpose: meta.p || "",
        extra: meta.e,
      }
      encryptionKey = getKeyForVersion(masterKey, 2, derivationContext)
    }

    // Clean bytea format (remove \x prefix if present)
    const clean = (hex: string) => (hex.startsWith("\\x") ? hex.slice(2) : hex)

    const ciphertextBuffer = Buffer.from(clean(ciphertext), "hex")
    const ivBuffer = Buffer.from(clean(iv), "hex")
    const authTagBuffer = Buffer.from(clean(authTag), "hex")

    // Validate sizes
    if (ivBuffer.length !== 12) {
      throw new Error(`Invalid IV length: ${ivBuffer.length} (expected 12 bytes)`)
    }
    if (authTagBuffer.length !== 16) {
      throw new Error(`Invalid auth tag length: ${authTagBuffer.length} (expected 16 bytes)`)
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, ivBuffer)
    decipher.setAuthTag(authTagBuffer)

    try {
      let decrypted = decipher.update(ciphertextBuffer)
      decrypted = Buffer.concat([decrypted, decipher.final()])
      return decrypted.toString("utf8")
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  /**
   * Validates that a string is in proper Postgres bytea hex format
   *
   * @param value - String to validate
   * @returns true if valid bytea hex format
   */
  static isByteaHex(value: string): boolean {
    return /^\\x[0-9a-f]+$/i.test(value)
  }
}
