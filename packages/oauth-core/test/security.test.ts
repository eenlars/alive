/**
 * Security Layer Unit Tests
 */

import { describe, it, expect, beforeAll } from "vitest"
import { Security } from "../src/security.js"

// Set up test environment
beforeAll(() => {
  // Set dummy values for config (not used in security tests)
  process.env.SUPABASE_URL = "https://test.supabase.co"
  process.env.SUPABASE_SERVICE_KEY = "test-key"

  if (!process.env.LOCKBOX_MASTER_KEY) {
    // Generate a test key for testing
    process.env.LOCKBOX_MASTER_KEY = "0".repeat(64) // 32 bytes in hex
  }
})

describe("Security - AES-256-GCM", () => {
  describe("encrypt", () => {
    it("should encrypt plaintext to bytea format", () => {
      const plaintext = "super_secret_token_123"
      const { ciphertext, iv, authTag } = Security.encrypt(plaintext)

      // Verify bytea hex format (\x prefix)
      expect(ciphertext).toMatch(/^\\x[0-9a-f]+$/)
      expect(iv).toMatch(/^\\x[0-9a-f]+$/)
      expect(authTag).toMatch(/^\\x[0-9a-f]+$/)
    })

    it("should use 12-byte IV (24 hex chars)", () => {
      const { iv } = Security.encrypt("test")
      const hexPart = iv.slice(2) // Remove \x prefix
      expect(hexPart.length).toBe(24) // 12 bytes = 24 hex chars
    })

    it("should use 16-byte auth tag (32 hex chars)", () => {
      const { authTag } = Security.encrypt("test")
      const hexPart = authTag.slice(2) // Remove \x prefix
      expect(hexPart.length).toBe(32) // 16 bytes = 32 hex chars
    })

    it("should produce different ciphertexts for same plaintext (random IV)", () => {
      const plaintext = "same_content"
      const result1 = Security.encrypt(plaintext)
      const result2 = Security.encrypt(plaintext)

      expect(result1.ciphertext).not.toBe(result2.ciphertext)
      expect(result1.iv).not.toBe(result2.iv)
      expect(result1.authTag).not.toBe(result2.authTag)
    })

    it("should handle empty strings", () => {
      const { ciphertext, iv, authTag } = Security.encrypt("")
      expect(ciphertext).toMatch(/^\\x[0-9a-f]*$/)
      expect(iv).toMatch(/^\\x[0-9a-f]+$/)
      expect(authTag).toMatch(/^\\x[0-9a-f]+$/)
    })

    it("should handle unicode characters", () => {
      const plaintext = "🔐 OAuth tokens: 日本語 émojis"
      const result = Security.encrypt(plaintext)
      expect(result.ciphertext).toMatch(/^\\x[0-9a-f]+$/)
    })
  })

  describe("decrypt", () => {
    it("should decrypt ciphertext back to plaintext", () => {
      const plaintext = "super_secret_token_123"
      const { ciphertext, iv, authTag } = Security.encrypt(plaintext)

      const decrypted = Security.decrypt(ciphertext, iv, authTag)
      expect(decrypted).toBe(plaintext)
    })

    it("should handle bytea format with or without \\x prefix", () => {
      const plaintext = "test_secret"
      const { ciphertext, iv, authTag } = Security.encrypt(plaintext)

      // With \x prefix
      const decrypted1 = Security.decrypt(ciphertext, iv, authTag)
      expect(decrypted1).toBe(plaintext)

      // Without \x prefix (simulating raw hex from DB)
      const decrypted2 = Security.decrypt(ciphertext.slice(2), iv.slice(2), authTag.slice(2))
      expect(decrypted2).toBe(plaintext)
    })

    it("should fail with wrong auth tag", () => {
      const { ciphertext, iv } = Security.encrypt("test")
      const wrongTag = `\\x${"0".repeat(32)}`

      expect(() => Security.decrypt(ciphertext, iv, wrongTag)).toThrow()
    })

    it("should fail with wrong IV", () => {
      const { ciphertext, authTag } = Security.encrypt("test")
      const wrongIV = `\\x${"0".repeat(24)}`

      expect(() => Security.decrypt(ciphertext, wrongIV, authTag)).toThrow()
    })

    it("should fail with corrupted ciphertext", () => {
      const { ciphertext, iv, authTag } = Security.encrypt("test")
      const corrupted = `${ciphertext.slice(0, -2)}ff`

      expect(() => Security.decrypt(corrupted, iv, authTag)).toThrow()
    })

    it("should decrypt unicode correctly", () => {
      const plaintext = "🔐 OAuth: 日本語 émojis"
      const { ciphertext, iv, authTag } = Security.encrypt(plaintext)

      const decrypted = Security.decrypt(ciphertext, iv, authTag)
      expect(decrypted).toBe(plaintext)
    })

    it("should throw on invalid IV length", () => {
      const { ciphertext, authTag } = Security.encrypt("test")
      const shortIV = "\\x0011"

      expect(() => Security.decrypt(ciphertext, shortIV, authTag)).toThrow(/Invalid IV length/)
    })

    it("should throw on invalid auth tag length", () => {
      const { ciphertext, iv } = Security.encrypt("test")
      const shortTag = "\\x0011"

      expect(() => Security.decrypt(ciphertext, iv, shortTag)).toThrow(/Invalid auth tag length/)
    })
  })

  describe("isByteaHex", () => {
    it("should validate correct bytea hex format", () => {
      expect(Security.isByteaHex("\\x0011ff")).toBe(true)
      expect(Security.isByteaHex("\\xaabbccdd")).toBe(true)
      expect(Security.isByteaHex("\\xABCDEF123456")).toBe(true)
    })

    it("should reject invalid formats", () => {
      expect(Security.isByteaHex("0011ff")).toBe(false) // Missing \x
      expect(Security.isByteaHex("\\x")).toBe(false) // No hex digits
      expect(Security.isByteaHex("\\xGG")).toBe(false) // Invalid hex
      expect(Security.isByteaHex("x0011")).toBe(false) // Wrong prefix
    })
  })

  describe("round-trip encryption", () => {
    it("should handle long strings", () => {
      const plaintext = "x".repeat(10000)
      const { ciphertext, iv, authTag } = Security.encrypt(plaintext)
      const decrypted = Security.decrypt(ciphertext, iv, authTag)
      expect(decrypted).toBe(plaintext)
    })

    it("should handle special characters", () => {
      const plaintext = "abc\n\r\t\"'\\\0xyz"
      const { ciphertext, iv, authTag } = Security.encrypt(plaintext)
      const decrypted = Security.decrypt(ciphertext, iv, authTag)
      expect(decrypted).toBe(plaintext)
    })
  })
})
