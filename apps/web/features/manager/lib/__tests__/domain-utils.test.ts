/**
 * Comprehensive tests for domain utility functions
 * Tests functionality, edge cases, attack vectors, and real-world scenarios
 */

import { describe, expect, it } from "vitest"
import {
  domainToSlug,
  getDomainUser,
  isValidDomain,
  normalizeAndValidateDomain,
  normalizeDomain,
} from "@/features/manager/lib/domain-utils"

// ============================================================================
// TypeScript Types for Test Fixtures
// ============================================================================

interface DomainTestCase {
  input: string
  expected: string
  description: string
}

interface ValidationTestCase {
  domain: string
  shouldBeValid: boolean
  description: string
}

// ============================================================================
// Test: normalizeDomain()
// ============================================================================

describe("normalizeDomain", () => {
  describe("Protocol Removal", () => {
    const testCases: DomainTestCase[] = [
      { input: "http://example.com", expected: "example.com", description: "http protocol" },
      { input: "https://example.com", expected: "example.com", description: "https protocol" },
      { input: "ftp://example.com", expected: "example.com", description: "ftp protocol" },
    ]

    for (const testCase of testCases) {
      it(`should remove ${testCase.description}`, () => {
        expect(normalizeDomain(testCase.input)).toBe(testCase.expected)
      })
    }
  })

  describe("Case and Whitespace", () => {
    it("should convert to lowercase", () => {
      expect(normalizeDomain("EXAMPLE.COM")).toBe("example.com")
    })

    it("should trim whitespace", () => {
      expect(normalizeDomain("  example.com  ")).toBe("example.com")
    })
  })

  describe("Edge Cases", () => {
    it("should return empty string for empty input", () => {
      expect(normalizeDomain("")).toBe("")
    })

    it("should return empty string for null", () => {
      expect(normalizeDomain(null as any)).toBe("")
    })

    it("should return empty string for undefined", () => {
      expect(normalizeDomain(undefined as any)).toBe("")
    })
  })
})

// ============================================================================
// Test: isValidDomain()
// ============================================================================

describe("isValidDomain", () => {
  describe("Valid Domains", () => {
    const validDomains: ValidationTestCase[] = [
      { domain: "example.com", shouldBeValid: true, description: "simple domain" },
      { domain: "sub.example.com", shouldBeValid: true, description: "subdomain" },
      { domain: "my-site.com", shouldBeValid: true, description: "domain with hyphen" },
    ]

    for (const testCase of validDomains) {
      it(`should accept ${testCase.description}`, () => {
        expect(isValidDomain(testCase.domain)).toBe(testCase.shouldBeValid)
      })
    }
  })

  describe("Invalid Domains", () => {
    const invalidDomains: ValidationTestCase[] = [
      { domain: "", shouldBeValid: false, description: "empty string" },
      { domain: "example", shouldBeValid: false, description: "no TLD" },
      { domain: "-example.com", shouldBeValid: false, description: "starts with hyphen" },
    ]

    for (const testCase of invalidDomains) {
      it(`should reject ${testCase.description}`, () => {
        expect(isValidDomain(testCase.domain)).toBe(testCase.shouldBeValid)
      })
    }
  })
})

// ============================================================================
// Test: domainToSlug()
// ============================================================================

describe("domainToSlug", () => {
  it("should convert dots to hyphens", () => {
    expect(domainToSlug("example.com")).toBe("example-com")
  })

  it("should convert special characters to hyphens", () => {
    expect(domainToSlug("my_site.com")).toBe("my-site-com")
  })

  it("should handle empty string", () => {
    expect(domainToSlug("")).toBe("")
  })
})

// ============================================================================
// Test: getDomainUser()
// ============================================================================

describe("getDomainUser", () => {
  it("should create valid system user names", () => {
    expect(getDomainUser("example.com")).toBe("site-example-com")
  })

  it("should prepend site- prefix", () => {
    const username = getDomainUser("test.io")
    expect(username).toMatch(/^site-/)
  })
})

// ============================================================================
// Test: normalizeAndValidateDomain()
// ============================================================================

describe("normalizeAndValidateDomain", () => {
  it("should normalize and validate in one step", () => {
    const result = normalizeAndValidateDomain("HTTPS://Example.COM")
    expect(result.domain).toBe("example.com")
    expect(result.isValid).toBe(true)
  })

  it("should return error for empty input", () => {
    const result = normalizeAndValidateDomain("")
    expect(result.isValid).toBe(false)
    expect(result.error).toBeDefined()
  })
})
