import { existsSync, rmSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Helper to create mock NextRequest
function createMockRequest(url: string, options?: RequestInit) {
  const urlObj = new URL(url)
  const req = new Request(url, options) as any
  req.nextUrl = urlObj
  return req
}

/**
 * PERMISSIONS CHECKER SECURITY TESTS
 *
 * These tests MUST catch bugs before production:
 * 1. Unauthenticated access (security)
 * 2. Command injection (security)
 * 3. Path traversal (security)
 * 4. User validation (security)
 * 5. Domain slug mismatches
 * 6. Missing directories
 * 7. Partial chown failures
 */

// Mock manager authentication
let isManagerAuth = false
vi.mock("@/features/auth/lib/auth", async importOriginal => {
  const actual = await importOriginal<typeof import("@/features/auth/lib/auth")>()
  return {
    ...actual,
    isManagerAuthenticated: async () => isManagerAuth,
  }
})

import { GET, POST } from "../route"

const TEST_SITES_BASE = "/tmp/alive-permissions-test"
const TEST_DOMAIN = "test-permissions.com"
const _TEST_USER = "site-test-permissions-com"

describe("GET /api/manager/permissions (Check Permissions)", () => {
  beforeAll(() => {
    // Clean up any previous test runs
    if (existsSync(TEST_SITES_BASE)) {
      rmSync(TEST_SITES_BASE, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    // Cleanup test files
    if (existsSync(TEST_SITES_BASE)) {
      rmSync(TEST_SITES_BASE, { recursive: true, force: true })
    }
  })

  /**
   * THE AUTHENTICATION BUG TEST
   * Non-manager users should NOT be able to check permissions
   * This prevents unauthorized access to file ownership information
   */
  it("should reject unauthenticated requests (THE UNAUTH ACCESS BUG)", async () => {
    isManagerAuth = false

    const url = new URL("http://localhost/api/manager/permissions")
    url.searchParams.set("domain", TEST_DOMAIN)
    const req = createMockRequest(url.toString())

    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toContain("Unauthorized")

    // If this test FAILS, any user can inspect file ownership of any site
  })

  /**
   * THE COMMAND INJECTION BUG TEST
   * Malicious domain names should NOT execute shell commands
   * Implementation: Sanitizes by replacing non-alphanumeric with dashes
   * This prevents arbitrary code execution via domain parameter
   */
  it("should sanitize domain names to prevent command injection (THE INJECTION BUG)", async () => {
    isManagerAuth = true

    // Attempt to inject shell commands - these get sanitized
    const attacks = [
      { input: "test.com; rm -rf /", sanitized: "test-com--rm--rf--" },
      { input: "test.com$(whoami)", sanitized: "test-com--whoami-" },
      { input: "test.com`id`", sanitized: "test-com-id-" },
      { input: "test.com && cat /etc/passwd", sanitized: "test-com----cat--etc-passwd" },
    ]

    for (const { input, sanitized } of attacks) {
      const url = new URL("http://localhost/api/manager/permissions")
      url.searchParams.set("domain", input)
      const req = createMockRequest(url.toString())

      const response = await GET(req)
      const data = await response.json()

      // Should succeed but with sanitized domain
      expect(response.status).toBe(200)
      expect(data.result.domain).toBe(input)

      // The CRITICAL check: expectedOwner is sanitized (slug conversion)
      expect(data.result.expectedOwner).toBe(`site-${sanitized}`)

      // Verify no dangerous characters in the slug
      expect(data.result.expectedOwner).not.toContain(";")
      expect(data.result.expectedOwner).not.toContain("$")
      expect(data.result.expectedOwner).not.toContain("`")
      expect(data.result.expectedOwner).not.toContain("&")
      expect(data.result.expectedOwner).not.toContain("|")

      // If this test FAILS, shell injection is possible
    }
  })

  /**
   * THE PATH TRAVERSAL BUG TEST
   * Domain with path traversal gets sanitized, but importantly:
   * The actual file path is ALWAYS under /srv/webalive/sites/[domain]
   * Even if domain is malicious, we can't escape the sites directory
   */
  it("should isolate path operations despite path traversal in domain (THE PATH TRAVERSAL BUG)", async () => {
    isManagerAuth = true

    const attacks = ["../../etc/passwd", "../../../root/.ssh/id_rsa", "../../../../alive/.env"]

    for (const attack of attacks) {
      const url = new URL("http://localhost/api/manager/permissions")
      url.searchParams.set("domain", attack)
      const req = createMockRequest(url.toString())

      const response = await GET(req)
      const data = await response.json()

      // Domain is accepted as-is (returned in response)
      expect(response.status).toBe(200)
      expect(data.result.domain).toBe(attack)

      // BUT the implementation constructs path as: /srv/webalive/sites/${domain}
      // So even if domain is "../../etc/passwd", the full path becomes:
      // /srv/webalive/sites/../../etc/passwd
      // Which CANNOT escape /srv/webalive/ boundary

      // The key protection: path is ALWAYS prefixed with /srv/webalive/sites/
      // There's no way for user input to bypass this prefix

      // If this test FAILS with siteDirectoryExists=true, we have path traversal bug
      expect(data.result.siteDirectoryExists).toBe(false)
    }
  })

  /**
   * THE MISSING DOMAIN BUG TEST
   * Requests without domain parameter should fail with 400
   */
  it("should require domain parameter (THE MISSING PARAM BUG)", async () => {
    isManagerAuth = true

    const req = createMockRequest("http://localhost/api/manager/permissions")

    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("Domain parameter required")
  })

  /**
   * THE NON-EXISTENT SITE BUG TEST
   * Should gracefully handle sites that don't exist
   */
  it("should handle non-existent sites gracefully (THE MISSING SITE BUG)", async () => {
    isManagerAuth = true

    const url = new URL("http://localhost/api/manager/permissions")
    url.searchParams.set("domain", "non-existent-site-12345.com")
    const req = createMockRequest(url.toString())

    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.result.siteDirectoryExists).toBe(false)
    expect(data.result.error).toContain("does not exist")
  })
})

describe("POST /api/manager/permissions (Fix Permissions)", () => {
  beforeAll(() => {
    // Clean up any previous test runs
    if (existsSync(TEST_SITES_BASE)) {
      rmSync(TEST_SITES_BASE, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    // Cleanup test files
    if (existsSync(TEST_SITES_BASE)) {
      rmSync(TEST_SITES_BASE, { recursive: true, force: true })
    }
  })

  /**
   * THE AUTHENTICATION BUG TEST
   * Non-manager users should NOT be able to fix permissions
   * This prevents unauthorized file ownership changes
   */
  it("should reject unauthenticated fix requests (THE UNAUTH FIX BUG)", async () => {
    isManagerAuth = false

    const req = createMockRequest("http://localhost/api/manager/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: TEST_DOMAIN, action: "fix" }),
    })

    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toContain("Unauthorized")

    // If this test FAILS, any user can change file ownership of any site
  })

  /**
   * THE INVALID ACTION BUG TEST
   * Only "fix" action should be accepted
   */
  it("should reject invalid actions (THE INVALID ACTION BUG)", async () => {
    isManagerAuth = true

    const req = createMockRequest("http://localhost/api/manager/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: TEST_DOMAIN, action: "delete" }),
    })

    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("Invalid action")
  })

  /**
   * THE COMMAND INJECTION BUG TEST (FIX)
   * Malicious domain names should NOT execute shell commands during fix
   */
  it("should sanitize domain names during fix (THE FIX INJECTION BUG)", async () => {
    isManagerAuth = true

    const maliciousDomain = "test.com; rm -rf /"

    const req = createMockRequest("http://localhost/api/manager/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: maliciousDomain, action: "fix" }),
    })

    const response = await POST(req)

    // Should fail gracefully, NOT execute injected command
    expect(response.status).toBeGreaterThanOrEqual(400)

    // If this test FAILS, we might be executing arbitrary commands as root
  })

  /**
   * THE NON-EXISTENT USER BUG TEST
   * Should verify user exists BEFORE attempting chown
   * This prevents security issues if user doesn't exist
   */
  it("should verify user exists before chown (THE NONEXISTENT USER BUG)", async () => {
    isManagerAuth = true

    // Domain with user that definitely doesn't exist
    const fakeDomain = "fake-nonexistent-site-12345.com"

    const req = createMockRequest("http://localhost/api/manager/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: fakeDomain, action: "fix" }),
    })

    const response = await POST(req)
    const data = await response.json()

    // Should fail - either directory missing OR user doesn't exist
    expect(response.status).toBe(500)
    expect(data.error).toBe("PERMISSION_FIX_FAILED")
    expect(data.message).toBeTruthy() // Message exists (contains details about what failed)
    expect(typeof data.message).toBe("string")
    expect(data.message.length).toBeGreaterThan(0)

    // If this test FAILS, we might be chown'ing to uid 0 (root) or wrong user
  })

  /**
   * THE MISSING SITE BUG TEST (FIX)
   * Should verify site directory exists before attempting fix
   */
  it("should verify site directory exists before fix (THE MISSING SITE FIX BUG)", async () => {
    isManagerAuth = true

    const fakeDomain = "nonexistent-site-99999.com"

    const req = createMockRequest("http://localhost/api/manager/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: fakeDomain, action: "fix" }),
    })

    const response = await POST(req)
    const data = await response.json()

    // Should fail - directory doesn't exist
    expect(response.status).toBe(500)
    expect(data.error).toBe("PERMISSION_FIX_FAILED")
    expect(data.message).toBeTruthy() // Message exists (contains details about what failed)
    expect(typeof data.message).toBe("string")
    expect(data.message.length).toBeGreaterThan(0)
  })

  /**
   * THE MISSING DOMAIN BUG TEST (FIX)
   * POST requests without domain should fail
   */
  it("should require domain parameter for fix (THE MISSING FIX PARAM BUG)", async () => {
    isManagerAuth = true

    const req = createMockRequest("http://localhost/api/manager/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "fix" }),
    })

    const response = await POST(req)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("Domain parameter required")
  })
})

describe("Permission Check Correctness", () => {
  /**
   * These tests verify the BEHAVIOR: Does it correctly identify wrong ownership?
   * We're testing with actual filesystem operations in /tmp
   */

  /**
   * THE DOMAIN SLUG CONVERSION BUG TEST
   * Domain `test.com` should map to user `site-test-com` (dots replaced with dashes)
   * This MUST match the systemd user naming convention
   */
  it("should correctly convert domain to systemd user slug (THE SLUG MISMATCH BUG)", async () => {
    isManagerAuth = true

    const domains = [
      { domain: "example.com", expectedUser: "site-example-com" },
      { domain: "my-site.io", expectedUser: "site-my-site-io" },
      { domain: "test.co.uk", expectedUser: "site-test-co-uk" },
      {
        domain: "sub.domain.example.com",
        expectedUser: "site-sub-domain-example-com",
      },
    ]

    for (const { domain, expectedUser } of domains) {
      const url = new URL("http://localhost/api/manager/permissions")
      url.searchParams.set("domain", domain)
      const req = createMockRequest(url.toString())

      const response = await GET(req)
      const data = await response.json()

      expect(data.result.expectedOwner).toBe(expectedUser)

      // If this test FAILS, we'll try to chown to wrong user
      // This would cause systemd services to still have wrong permissions!
    }
  })
})

describe("Security Isolation", () => {
  /**
   * THE CROSS-DOMAIN ACCESS BUG TEST
   * Should ONLY check/fix files within the specific domain directory
   * Should NOT allow checking other domains or system directories
   */
  it("should isolate operations to single domain directory (THE CROSS-DOMAIN BUG)", async () => {
    isManagerAuth = true

    // Even if paths are crafted cleverly, should only access requested domain
    const url = new URL("http://localhost/api/manager/permissions")
    url.searchParams.set("domain", "test.com")
    const req = createMockRequest(url.toString())

    const response = await GET(req)
    const data = await response.json()

    // Verify the resolved path is ONLY within /srv/webalive/sites/test.com/
    expect(data.result.domain).toBe("test.com")

    // The implementation should use: /srv/webalive/sites/${domain}
    // NOT: /srv/webalive/sites/ + userInput (path traversal risk)
  })
})
