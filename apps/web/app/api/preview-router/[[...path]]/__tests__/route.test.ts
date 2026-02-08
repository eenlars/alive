/**
 * Tests for Preview Router
 *
 * Security-critical tests:
 * - Authentication required (401 without user)
 * - Workspace authorization - cross-tenant protection (403 for unauthorized workspace)
 * - Valid request flows for authorized users
 */

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock auth functions
vi.mock("@/features/auth/lib/auth", async () => {
  const { NextResponse } = await import("next/server")
  return {
    getSessionUser: vi.fn(),
    isWorkspaceAuthenticated: vi.fn(),
    createErrorResponse: vi.fn((code, status, fields) => {
      return NextResponse.json({ ok: false, error: code, ...fields }, { status })
    }),
  }
})

// Mock domains lookup
vi.mock("@/lib/domains", () => ({
  getDomainPort: vi.fn(),
}))

// Mock preview-utils
vi.mock("@/lib/preview-utils", () => ({
  previewLabelToDomain: vi.fn((label: string) => label.replace(/-/g, ".")),
}))

// Mock @webalive/shared
// Only mock the exports actually used by this route (DOMAINS.PREVIEW_BASE, PREVIEW_MESSAGES)
// Use a generic test domain to keep tests server-agnostic
const TEST_PREVIEW_BASE = "preview.test.local"
vi.mock("@webalive/shared", () => ({
  DOMAINS: {
    PREVIEW_BASE: TEST_PREVIEW_BASE,
  },
  PREVIEW_MESSAGES: {
    NAVIGATION_START: "preview-navigation-start",
    NAVIGATION: "preview-navigation",
  },
}))

// Import after mocking
const { GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS } = await import("../route")
const { getSessionUser, isWorkspaceAuthenticated } = await import("@/features/auth/lib/auth")
const { getDomainPort } = await import("@/lib/domains")

// Mock user
const MOCK_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
  enabledModels: [],
}

function createMockRequest(host: string, method: string = "GET", path: string = "/"): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "x-forwarded-host": host,
      host: host,
    },
  })
}

describe("Preview Router", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: authenticated user
    vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

    // Default: workspace NOT authenticated (secure by default)
    vi.mocked(isWorkspaceAuthenticated).mockResolvedValue(false)

    // Default: valid port
    vi.mocked(getDomainPort).mockResolvedValue(3357)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Authentication", () => {
    it("should require session (401 without user)", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const req = createMockRequest("test-workspace.preview.test.local")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("UNAUTHORIZED")
    })

    it("should continue to authorization check for authenticated users", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(isWorkspaceAuthenticated).mockResolvedValue(false)

      const req = createMockRequest("test-workspace.preview.test.local")
      const response = await GET(req)
      const data = await response.json()

      // Should fail at authorization, not authentication
      expect(response.status).toBe(403)
      expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")
    })
  })

  describe("Workspace Authorization (Cross-Tenant Protection)", () => {
    it("should deny access to unauthorized workspace (403)", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(isWorkspaceAuthenticated).mockResolvedValue(false)

      const req = createMockRequest("other-tenant.preview.test.local")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")
      expect(data.hostname).toBe("other.tenant")
    })

    it("should call isWorkspaceAuthenticated with correct hostname", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(isWorkspaceAuthenticated).mockResolvedValue(false)

      const req = createMockRequest("my-cool-site.preview.test.local")
      await GET(req)

      expect(isWorkspaceAuthenticated).toHaveBeenCalledWith("my.cool.site")
    })

    it("should allow access to authorized workspace", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(isWorkspaceAuthenticated).mockResolvedValue(true)
      vi.mocked(getDomainPort).mockResolvedValue(3357)

      // Mock fetch for proxy request
      const mockFetch = vi.fn().mockResolvedValue(
        new Response("test content", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      )
      // @ts-expect-error - Mock fetch doesn't need full type compliance
      global.fetch = mockFetch

      const req = createMockRequest("my-workspace.preview.test.local")
      const response = await GET(req)

      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalled()
    })

    it("should prevent users from accessing other tenants' previews", async () => {
      // User A is logged in
      vi.mocked(getSessionUser).mockResolvedValue({
        id: "user-a",
        email: "a@example.com",
        name: "User A",
        canSelectAnyModel: false,
        isAdmin: false,
        isSuperadmin: false,
        enabledModels: [],
      })

      // User A tries to access User B's workspace
      vi.mocked(isWorkspaceAuthenticated).mockResolvedValue(false)

      const req = createMockRequest("user-b-site.preview.test.local")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")
    })
  })

  describe("Invalid Host Handling", () => {
    it("should return 400 for non-preview host", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

      const req = createMockRequest("some-other-domain.com")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })

    it("should return 400 for empty preview label", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

      const req = createMockRequest(".preview.test.local")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("INVALID_REQUEST")
    })
  })

  describe("Port Lookup", () => {
    it("should return 404 when domain has no port configured", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(isWorkspaceAuthenticated).mockResolvedValue(true)
      vi.mocked(getDomainPort).mockResolvedValue(null)

      const req = createMockRequest("unconfigured-site.preview.test.local")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe("WORKSPACE_NOT_FOUND")
    })
  })

  describe("HTTP Methods", () => {
    it.each([
      ["GET", GET],
      ["POST", POST],
      ["PUT", PUT],
      ["DELETE", DELETE],
      ["PATCH", PATCH],
      ["HEAD", HEAD],
      ["OPTIONS", OPTIONS],
    ] as const)("should handle %s requests with authorization", async (method, handler) => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(isWorkspaceAuthenticated).mockResolvedValue(false)

      const req = createMockRequest("test-site.preview.test.local", method)
      const response = await handler(req)
      const data = await response.json()

      // All methods should check authorization
      expect(response.status).toBe(403)
      expect(data.error).toBe("WORKSPACE_NOT_AUTHENTICATED")
    })
  })
})
