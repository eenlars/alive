/**
 * Tests for Timing-Safe String Comparison
 *
 * Security-critical tests:
 * - Correct comparison results
 * - Handles edge cases safely
 * - Type validation
 *
 * Note: We cannot directly test timing characteristics in unit tests,
 * but we verify the implementation uses crypto.timingSafeEqual correctly.
 */

import { describe, expect, it } from "vitest"
import { timingSafeCompare } from "../timing-safe"

describe("timingSafeCompare", () => {
  describe("Correct Comparison Results", () => {
    it("should return true for identical strings", () => {
      expect(timingSafeCompare("password123", "password123")).toBe(true)
    })

    it("should return true for empty strings", () => {
      expect(timingSafeCompare("", "")).toBe(true)
    })

    it("should return false for different strings", () => {
      expect(timingSafeCompare("password123", "password124")).toBe(false)
    })

    it("should return false for strings with different lengths", () => {
      expect(timingSafeCompare("short", "longer-string")).toBe(false)
    })

    it("should return false when only one character differs", () => {
      expect(timingSafeCompare("abcdefghij", "abcdefghik")).toBe(false)
    })

    it("should return false when first character differs", () => {
      expect(timingSafeCompare("xbcdefghij", "abcdefghij")).toBe(false)
    })

    it("should return false when last character differs", () => {
      expect(timingSafeCompare("abcdefghij", "abcdefghix")).toBe(false)
    })
  })

  describe("Type Validation", () => {
    it("should return false when first argument is null", () => {
      expect(timingSafeCompare(null as unknown as string, "test")).toBe(false)
    })

    it("should return false when second argument is null", () => {
      expect(timingSafeCompare("test", null as unknown as string)).toBe(false)
    })

    it("should return false when first argument is undefined", () => {
      expect(timingSafeCompare(undefined as unknown as string, "test")).toBe(false)
    })

    it("should return false when second argument is undefined", () => {
      expect(timingSafeCompare("test", undefined as unknown as string)).toBe(false)
    })

    it("should return false when first argument is a number", () => {
      expect(timingSafeCompare(123 as unknown as string, "123")).toBe(false)
    })

    it("should return false when second argument is a number", () => {
      expect(timingSafeCompare("123", 123 as unknown as string)).toBe(false)
    })

    it("should return false when first argument is an object", () => {
      expect(timingSafeCompare({ toString: () => "test" } as unknown as string, "test")).toBe(false)
    })

    it("should return false when second argument is an array", () => {
      expect(timingSafeCompare("test", ["test"] as unknown as string)).toBe(false)
    })
  })

  describe("Unicode Handling", () => {
    it("should handle unicode strings correctly", () => {
      expect(timingSafeCompare("héllo wörld", "héllo wörld")).toBe(true)
    })

    it("should return false for different unicode strings", () => {
      expect(timingSafeCompare("héllo", "hello")).toBe(false)
    })

    it("should handle emoji correctly", () => {
      expect(timingSafeCompare("test🔐emoji", "test🔐emoji")).toBe(true)
    })

    it("should return false for different emoji", () => {
      expect(timingSafeCompare("test🔐emoji", "test🔑emoji")).toBe(false)
    })

    it("should handle Chinese characters", () => {
      expect(timingSafeCompare("密码", "密码")).toBe(true)
    })

    it("should return false for different Chinese characters", () => {
      expect(timingSafeCompare("密码", "密码码")).toBe(false)
    })
  })

  describe("Edge Cases", () => {
    it("should handle very long strings", () => {
      const longString = "a".repeat(10000)
      expect(timingSafeCompare(longString, longString)).toBe(true)
    })

    it("should return false for very long strings that differ at the end", () => {
      const longString1 = `${"a".repeat(9999)}b`
      const longString2 = `${"a".repeat(9999)}c`
      expect(timingSafeCompare(longString1, longString2)).toBe(false)
    })

    it("should handle strings with null bytes", () => {
      expect(timingSafeCompare("test\0string", "test\0string")).toBe(true)
    })

    it("should return false when null bytes differ", () => {
      expect(timingSafeCompare("test\0a", "test\0b")).toBe(false)
    })

    it("should handle strings with newlines", () => {
      expect(timingSafeCompare("line1\nline2", "line1\nline2")).toBe(true)
    })

    it("should handle strings with tabs", () => {
      expect(timingSafeCompare("col1\tcol2", "col1\tcol2")).toBe(true)
    })

    it("should handle mixed whitespace", () => {
      expect(timingSafeCompare("a b\tc\nd", "a b\tc\nd")).toBe(true)
    })

    it("should be case-sensitive", () => {
      expect(timingSafeCompare("Password", "password")).toBe(false)
    })
  })

  describe("Security Considerations", () => {
    it("should handle JWT-like tokens", () => {
      const token1 =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
      const token2 =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
      expect(timingSafeCompare(token1, token2)).toBe(true)
    })

    it("should detect single bit differences in hex strings", () => {
      const hex1 = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
      const hex2 = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d7" // Last char different
      expect(timingSafeCompare(hex1, hex2)).toBe(false)
    })

    it("should handle session tokens", () => {
      const session1 = "sess_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz"
      const session2 = "sess_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz"
      expect(timingSafeCompare(session1, session2)).toBe(true)
    })

    it("should handle bcrypt hashes", () => {
      const hash1 = "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMN"
      const hash2 = "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMN"
      expect(timingSafeCompare(hash1, hash2)).toBe(true)
    })

    it("should return false for similar bcrypt hashes", () => {
      const hash1 = "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMN"
      const hash2 = "$2b$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMO" // Last char different
      expect(timingSafeCompare(hash1, hash2)).toBe(false)
    })
  })
})
