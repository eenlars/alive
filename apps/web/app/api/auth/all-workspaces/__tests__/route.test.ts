/**
 * Tests for GET /api/auth/all-workspaces endpoint
 *
 * Security-critical tests:
 * - Authentication required
 * - Superadmin workspace filtered for non-superadmins
 * - Server-agnostic: only returns domains that exist on THIS server's filesystem
 *
 * NOTE: These are HTTP layer tests that mock internal dependencies.
 * TODO: Consider adding integration tests with real Supabase test clients
 * for end-to-end coverage of auth/CORS/database behavior.
 */

import { SECURITY, SUPERADMIN, TEST_CONFIG } from "@webalive/shared"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock auth functions
vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

// Mock CORS responses
vi.mock("@/lib/api/responses", () => ({
  createCorsErrorResponse: vi.fn((_origin, code, status, fields) => {
    return new Response(JSON.stringify({ ok: false, error: code, ...fields }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }),
  createCorsSuccessResponse: vi.fn((_origin, data) => {
    return new Response(JSON.stringify({ ok: true, ...data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }),
}))

// Mock CORS headers
vi.mock("@/lib/cors-utils", () => ({
  addCorsHeaders: vi.fn(),
}))

// Mock domains helper - THIS IS THE KEY FUNCTION FOR SERVER-AGNOSTIC BEHAVIOR
vi.mock("@/lib/domains", () => ({
  domainExistsOnThisServer: vi.fn(),
}))

// Mock Supabase clients
const mockIamFrom = vi.fn()
const mockAppFrom = vi.fn()

vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(() => ({
    from: mockIamFrom,
  })),
}))

vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(() => ({
    from: mockAppFrom,
  })),
}))

// Import after mocking
const { GET } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { domainExistsOnThisServer } = await import("@/lib/domains")

// Mock users
const REGULAR_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

const SUPERADMIN_USER = {
  id: "admin-456",
  email: "admin@example.com",
  name: "Admin User",
  canSelectAnyModel: true,
  isAdmin: true,
  isSuperadmin: true,
  enabledModels: [],
}

const LOCAL_TEST_USER = {
  id: SECURITY.LOCAL_TEST.SESSION_VALUE,
  email: "test@alive.local",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

function createMockRequest(): NextRequest {
  return new NextRequest("http://localhost/api/auth/all-workspaces", {
    method: "GET",
    headers: { origin: "http://localhost:3000" },
  })
}

// Helper to set up membership query mock
function mockMemberships(memberships: { org_id: string }[] | null) {
  mockIamFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: memberships, error: null }),
    }),
  })
}

// Helper to set up domains query mock
// Supports both superadmin path (direct select) and regular user path (select + in)
function mockDomains(domains: { hostname: string; org_id: string | null }[] | null) {
  const selectResult = {
    in: vi.fn().mockResolvedValue({ data: domains, error: null }),
    // Support direct await for superadmin path (intentionally Promise-like)
    // biome-ignore lint/suspicious/noThenProperty: Mocking Supabase's thenable query builder
    then: (resolve: (value: { data: typeof domains; error: null }) => void) => resolve({ data: domains, error: null }),
  }
  mockAppFrom.mockReturnValue({
    select: vi.fn().mockReturnValue(selectResult),
  })
}

describe("GET /api/auth/all-workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: authenticated regular user
    vi.mocked(getSessionUser).mockResolvedValue(REGULAR_USER)
    // Default: all domains exist on server
    vi.mocked(domainExistsOnThisServer).mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe("Authentication", () => {
    it("should return 401 when no session", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("UNAUTHORIZED")
    })

    it("should proceed when user is authenticated", async () => {
      mockMemberships([])

      const req = createMockRequest()
      const response = await GET(req)

      expect(response.status).toBe(200)
    })
  })

  describe("Empty state", () => {
    it("should return empty workspaces when user has no org memberships", async () => {
      mockMemberships([])

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces).toEqual({})
    })

    it("should return empty workspaces when memberships is null", async () => {
      mockMemberships(null)

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces).toEqual({})
    })
  })

  describe("Server-agnostic filtering (CRITICAL)", () => {
    it("should only return domains that exist on this server", async () => {
      mockMemberships([{ org_id: "org-1" }])
      mockDomains([
        { hostname: "exists.example.com", org_id: "org-1" },
        { hostname: "not-exists.example.com", org_id: "org-1" },
        { hostname: "also-exists.example.com", org_id: "org-1" },
      ])

      // Only some domains exist on this server
      vi.mocked(domainExistsOnThisServer).mockImplementation((hostname: string) => {
        return hostname === "exists.example.com" || hostname === "also-exists.example.com"
      })

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces["org-1"]).toEqual(["exists.example.com", "also-exists.example.com"])
      expect(data.workspaces["org-1"]).not.toContain("not-exists.example.com")
    })

    it("should return empty array for org when no domains exist on this server", async () => {
      mockMemberships([{ org_id: "org-1" }])
      mockDomains([
        { hostname: "remote-server-1.com", org_id: "org-1" },
        { hostname: "remote-server-2.com", org_id: "org-1" },
      ])

      // None of the domains exist on this server
      vi.mocked(domainExistsOnThisServer).mockReturnValue(false)

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces["org-1"]).toEqual([])
    })

    it("should handle multiple orgs with mixed domain availability", async () => {
      mockMemberships([{ org_id: "org-1" }, { org_id: "org-2" }])
      mockDomains([
        { hostname: "local-1.com", org_id: "org-1" },
        { hostname: "remote-1.com", org_id: "org-1" },
        { hostname: "local-2.com", org_id: "org-2" },
      ])

      vi.mocked(domainExistsOnThisServer).mockImplementation((hostname: string) => {
        return hostname.startsWith("local-")
      })

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces["org-1"]).toEqual(["local-1.com"])
      expect(data.workspaces["org-2"]).toEqual(["local-2.com"])
    })

    it("should call domainExistsOnThisServer for each domain", async () => {
      mockMemberships([{ org_id: "org-1" }])
      mockDomains([
        { hostname: "site-a.com", org_id: "org-1" },
        { hostname: "site-b.com", org_id: "org-1" },
        { hostname: "site-c.com", org_id: "org-1" },
      ])

      vi.mocked(domainExistsOnThisServer).mockReturnValue(true)

      const req = createMockRequest()
      await GET(req)

      expect(domainExistsOnThisServer).toHaveBeenCalledTimes(3)
      expect(domainExistsOnThisServer).toHaveBeenCalledWith("site-a.com")
      expect(domainExistsOnThisServer).toHaveBeenCalledWith("site-b.com")
      expect(domainExistsOnThisServer).toHaveBeenCalledWith("site-c.com")
    })
  })

  describe("Superadmin workspace security", () => {
    it("should NOT include alive workspace for regular users", async () => {
      mockMemberships([{ org_id: "org-1" }])
      mockDomains([
        { hostname: "normal-site.com", org_id: "org-1" },
        { hostname: SUPERADMIN.WORKSPACE_NAME, org_id: "org-1" },
      ])

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces["org-1"]).toEqual(["normal-site.com"])
      expect(data.workspaces["org-1"]).not.toContain(SUPERADMIN.WORKSPACE_NAME)
    })

    it("should include alive workspace for superadmin users", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(SUPERADMIN_USER)
      mockMemberships([{ org_id: "org-1" }])
      mockDomains([
        { hostname: "normal-site.com", org_id: "org-1" },
        { hostname: SUPERADMIN.WORKSPACE_NAME, org_id: "org-1" },
      ])

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces["org-1"]).toContain("normal-site.com")
      expect(data.workspaces["org-1"]).toContain(SUPERADMIN.WORKSPACE_NAME)
    })

    it("should filter alive workspace before checking filesystem existence", async () => {
      // This ensures we don't leak info about alive workspace even via timing
      mockMemberships([{ org_id: "org-1" }])
      mockDomains([{ hostname: SUPERADMIN.WORKSPACE_NAME, org_id: "org-1" }])

      const req = createMockRequest()
      await GET(req)

      // domainExistsOnThisServer should NOT be called for alive workspace
      // when user is not superadmin (filtered before filesystem check)
      expect(domainExistsOnThisServer).not.toHaveBeenCalledWith(SUPERADMIN.WORKSPACE_NAME)
    })
  })

  describe("Test mode", () => {
    it("should return mock data in local test mode", async () => {
      vi.stubEnv("BRIDGE_ENV", "local")
      vi.mocked(getSessionUser).mockResolvedValue(LOCAL_TEST_USER)

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces).toEqual({
        "test-org": [`test.${TEST_CONFIG.EMAIL_DOMAIN}`, `demo.${TEST_CONFIG.EMAIL_DOMAIN}`],
      })
    })

    it("should NOT use test mode for regular users even in local env", async () => {
      vi.stubEnv("BRIDGE_ENV", "local")
      mockMemberships([{ org_id: "real-org" }])
      mockDomains([{ hostname: "real-site.com", org_id: "real-org" }])

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      // Should get real data, not test mock
      expect(data.workspaces["test-org"]).toBeUndefined()
      expect(data.workspaces["real-org"]).toEqual(["real-site.com"])
    })
  })

  describe("Edge cases", () => {
    it("should handle domains with null org_id", async () => {
      mockMemberships([{ org_id: "org-1" }])
      mockDomains([
        { hostname: "valid.com", org_id: "org-1" },
        { hostname: "orphan.com", org_id: null as unknown as string },
      ])

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces["org-1"]).toEqual(["valid.com"])
    })

    it("should handle domains with null hostname", async () => {
      mockMemberships([{ org_id: "org-1" }])
      mockDomains([
        { hostname: "valid.com", org_id: "org-1" },
        { hostname: null as unknown as string, org_id: "org-1" },
      ])

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces["org-1"]).toEqual(["valid.com"])
    })

    it("should handle empty domains array", async () => {
      mockMemberships([{ org_id: "org-1" }])
      mockDomains([])

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces["org-1"]).toEqual([])
    })

    it("should handle null domains", async () => {
      mockMemberships([{ org_id: "org-1" }])
      mockDomains(null)

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces["org-1"]).toEqual([])
    })
  })

  describe("Error handling", () => {
    it("should return 500 on unexpected error", async () => {
      mockIamFrom.mockImplementation(() => {
        throw new Error("Database connection failed")
      })

      const req = createMockRequest()
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe("INTERNAL_ERROR")
    })
  })
})
