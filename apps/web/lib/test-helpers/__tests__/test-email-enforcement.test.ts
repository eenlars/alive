/**
 * Test Email Domain Enforcement Tests
 *
 * Ensures that test email validation is working correctly and prevents
 * accidental use of real email domains in tests.
 */

import { describe, expect, it } from "vitest"
import { ALLOWED_TEST_EMAIL_DOMAINS, generateTestEmail, isTestEmail, validateTestEmail } from "../test-email-domains"

describe("Test Email Domain Enforcement", () => {
  describe("ALLOWED_TEST_EMAIL_DOMAINS", () => {
    it("should contain only safe internal test domains", () => {
      expect(ALLOWED_TEST_EMAIL_DOMAINS).toContain("@bridge-vitest.internal")
      expect(ALLOWED_TEST_EMAIL_DOMAINS).toContain("@bridge-playwright.internal")
      expect(ALLOWED_TEST_EMAIL_DOMAINS).toContain("@alive-test.local")
    })

    it("should not contain any real or common test domains", () => {
      const bannedDomains = [
        "@example.com",
        "@yahoo.com",
        "@outlook.com",
        "@hotmail.com",
        "@alive.best",
        "@test.com",
        "@example.com",
        "@localhost",
        "@test.local", // Too generic!
      ]

      for (const domain of bannedDomains) {
        expect(ALLOWED_TEST_EMAIL_DOMAINS).not.toContain(domain)
      }
    })
  })

  describe("isTestEmail()", () => {
    it("should return true for allowed internal test email domains", () => {
      expect(isTestEmail("user@bridge-vitest.internal")).toBe(true)
      expect(isTestEmail("user@bridge-playwright.internal")).toBe(true)
      expect(isTestEmail("user@alive-test.local")).toBe(true)
    })

    it("should return false for real and common test domains", () => {
      expect(isTestEmail("user@example.com")).toBe(false)
      expect(isTestEmail("user@yahoo.com")).toBe(false)
      expect(isTestEmail("user@test.com")).toBe(false) // Too generic!
      expect(isTestEmail("user@example.com")).toBe(false) // Too generic!
      expect(isTestEmail("user@alive.best")).toBe(false)
    })

    it("should return false for malformed emails", () => {
      expect(isTestEmail("notanemail")).toBe(false)
      expect(isTestEmail("@test.com")).toBe(false)
      expect(isTestEmail("")).toBe(false)
    })
  })

  describe("validateTestEmail()", () => {
    it("should not throw for valid internal test emails", () => {
      expect(() => validateTestEmail("user@bridge-vitest.internal")).not.toThrow()
      expect(() => validateTestEmail("user@bridge-playwright.internal")).not.toThrow()
      expect(() => validateTestEmail("user@alive-test.local")).not.toThrow()
    })

    it("should throw for real email domains", () => {
      expect(() => validateTestEmail("user@example.com")).toThrow("SECURITY ERROR")
      expect(() => validateTestEmail("user@yahoo.com")).toThrow("SECURITY ERROR")
      expect(() => validateTestEmail("user@alive.best")).toThrow("SECURITY ERROR")
    })

    it("should throw with helpful error message", () => {
      try {
        validateTestEmail("user@example.com")
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect((error as Error).message).toContain("SECURITY ERROR")
        expect((error as Error).message).toContain("user@example.com")
        expect((error as Error).message).toContain("@bridge-vitest.internal")
        expect((error as Error).message).toContain("@bridge-playwright.internal")
      }
    })
  })

  describe("generateTestEmail()", () => {
    it("should generate valid test emails with default domain", () => {
      const email = generateTestEmail()
      expect(email).toMatch(/^test-\d+-[a-z0-9]+@bridge-vitest\.internal$/)
      expect(isTestEmail(email)).toBe(true)
    })

    it("should generate emails with custom prefix", () => {
      const email = generateTestEmail("mytest")
      expect(email).toMatch(/^mytest-\d+-[a-z0-9]+@bridge-vitest\.internal$/)
      expect(isTestEmail(email)).toBe(true)
    })

    it("should generate emails with custom allowed domain", () => {
      const email = generateTestEmail("test", "@bridge-playwright.internal")
      expect(email).toMatch(/^test-\d+-[a-z0-9]+@bridge-playwright\.internal$/)
      expect(isTestEmail(email)).toBe(true)
    })

    it("should throw when trying to use non-allowed domain", () => {
      expect(() => generateTestEmail("test", "@example.com")).toThrow()
    })

    it("should generate unique emails", () => {
      const email1 = generateTestEmail()
      const email2 = generateTestEmail()
      expect(email1).not.toBe(email2)
    })
  })
})
