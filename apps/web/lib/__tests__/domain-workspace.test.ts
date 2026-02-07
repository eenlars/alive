/**
 * Domain & Workspace Utilities Test
 *
 * Core routing logic - if these break, nothing works.
 */

import { DOMAINS, getServiceName, getSiteHome, getSiteUser, PATHS } from "@webalive/shared"
import { describe, expect, it } from "vitest"
import { domainToSlug, isValidDomain, normalizeDomain } from "@/features/manager/lib/domain-utils"

const hasConfiguredPaths = PATHS.SITES_ROOT.length > 0
const hasConfiguredDomains = DOMAINS.MAIN.length > 0

describe("Domain normalization", () => {
  it("normalizes domains correctly", () => {
    expect(normalizeDomain("EXAMPLE.COM")).toBe("example.com")
    expect(normalizeDomain("  example.com  ")).toBe("example.com")
    expect(normalizeDomain("https://example.com")).toBe("example.com")
    expect(normalizeDomain("http://example.com/path")).toBe("example.com")
  })

  it("validates domains", () => {
    expect(isValidDomain("example.com")).toBe(true)
    expect(isValidDomain("my-site.test.local")).toBe(true)
    expect(isValidDomain("sub.domain.com")).toBe(true)

    expect(isValidDomain("")).toBe(false)
    expect(isValidDomain("invalid")).toBe(false) // no TLD
    expect(isValidDomain("has spaces.com")).toBe(false)
  })

  it("converts domain to slug", () => {
    expect(domainToSlug("example.com")).toBe("example-com")
    expect(domainToSlug("my-site.test.local")).toBe("my-site-test-local")
  })
})

describe("Shared config helpers", () => {
  it("generates correct service names from slugs", () => {
    // Note: these functions take SLUGS, not domains
    // Use domainToSlug first to convert domain -> slug
    const slug = domainToSlug("example.com") // "example-com"
    expect(getServiceName(slug)).toBe("site@example-com.service")
  })

  it("generates correct site users from slugs", () => {
    const slug = domainToSlug("example.com")
    expect(getSiteUser(slug)).toBe("site-example-com")
  })

  it("generates correct site home paths", () => {
    // Verify structure: SITES_ROOT + "/" + domain
    if (hasConfiguredPaths) {
      expect(getSiteHome("example.com")).toBe(`${PATHS.SITES_ROOT}/example.com`)
      expect(getSiteHome("example.com")).toMatch(/\/example\.com$/)
    }
  })

  it("has correct base paths", () => {
    // Server config paths are optional in test environments
    if (hasConfiguredPaths) {
      expect(typeof PATHS.SITES_ROOT).toBe("string")
      expect(PATHS.SITES_ROOT.length).toBeGreaterThan(0)
    }
    if (hasConfiguredDomains) {
      expect(typeof DOMAINS.MAIN_SUFFIX).toBe("string")
      expect(DOMAINS.MAIN_SUFFIX.startsWith(".")).toBe(true)
    }
  })
})
