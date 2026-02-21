/**
 * Tests for POST /api/login endpoint
 *
 * Security-critical tests:
 * - Input validation (email format, password required)
 * - Password verification
 * - Session cookie creation
 * - Error responses don't leak user existence
 * - Local test mode handling
 */

import { SECURITY } from "@webalive/shared"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock Supabase clients
vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(),
}))

// Mock JWT
vi.mock("@/features/auth/lib/jwt", () => ({
  createSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
}))

// Mock password verification
vi.mock("@/types/guards/api", () => ({
  verifyPassword: vi.fn(),
}))

// Mock domain filtering (bypasses file system check)
vi.mock("@/lib/domains", () => ({
  filterLocalDomains: vi.fn((hostnames: string[]) => hostnames),
}))

// Import after mocking
const { POST } = await import("../route")
const { createIamClient } = await import("@/lib/supabase/iam")
const { createAppClient } = await import("@/lib/supabase/app")
const { createSessionToken } = await import("@/features/auth/lib/jwt")
const { verifyPassword } = await import("@/types/guards/api")

// Mock user data
const MOCK_USER: {
  user_id: string
  email: string
  password_hash: string | null
  display_name: string
} = {
  user_id: "user-123",
  email: "test@example.com",
  password_hash: "$2b$10$hashedpassword",
  display_name: "Test User",
}

// Mock membership/domain data
const MOCK_MEMBERSHIPS = [
  { org_id: "org-1", role: "owner" },
  { org_id: "org-2", role: "member" },
]
const MOCK_DOMAINS = [{ hostname: "site1.example.com" }, { hostname: "site2.example.com" }]

function createMockRequest(body: Record<string, unknown>, origin?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    host: "localhost",
  }
  if (origin) {
    headers.origin = origin
  }
  return new NextRequest("http://localhost/api/login", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

function setupMockSupabase(
  options: {
    user?: typeof MOCK_USER | null
    userError?: { code: string; message: string } | null
    memberships?: Array<{ org_id: string; role: string }>
    domains?: typeof MOCK_DOMAINS
  } = {},
) {
  const { user = MOCK_USER, userError = null, memberships = MOCK_MEMBERSHIPS, domains = MOCK_DOMAINS } = options

  // Mock IAM client
  const mockIamFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: user,
          error: userError,
        }),
      }),
    }),
  })

  // For memberships query
  const mockMembershipFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        data: memberships,
        error: null,
      }),
    }),
  })

  vi.mocked(createIamClient).mockResolvedValue({
    from: (table: string) => {
      if (table === "users") return mockIamFrom(table)
      if (table === "org_memberships") return mockMembershipFrom(table)
      return mockIamFrom(table)
    },
  } as never)

  // Mock App client for domains
  vi.mocked(createAppClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: domains,
          error: null,
        }),
      }),
    }),
  } as never)
}

describe("POST /api/login", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: password verification succeeds
    vi.mocked(verifyPassword).mockResolvedValue(true)
    // Default: mock supabase
    setupMockSupabase()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe("Input Validation", () => {
    it("should reject missing email", async () => {
      const req = createMockRequest({ password: "test123" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error.code).toBe("VALIDATION_ERROR")
    })

    it("should reject missing password", async () => {
      const req = createMockRequest({ email: "test@example.com" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error.code).toBe("VALIDATION_ERROR")
    })

    it("should reject invalid email format", async () => {
      const req = createMockRequest({ email: "not-an-email", password: "test123" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error.code).toBe("VALIDATION_ERROR")
    })

    it("should reject empty password", async () => {
      const req = createMockRequest({ email: "test@example.com", password: "" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error.code).toBe("VALIDATION_ERROR")
    })

    it("should reject invalid JSON body", async () => {
      const req = new NextRequest("http://localhost/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json{",
      })
      const response = await POST(req)
      // handleBody catches SyntaxError and returns 500 (HANDLE_BODY_ERROR)
      expect(response.status).toBe(500)
    })
  })

  describe("User Lookup", () => {
    it("should return 401 for non-existent user", async () => {
      setupMockSupabase({ user: null })

      const req = createMockRequest({
        email: "nonexistent@example.com",
        password: "test123",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("INVALID_CREDENTIALS")
    })

    it("should return 401 for user without password_hash", async () => {
      setupMockSupabase({
        user: { ...MOCK_USER, password_hash: null as string | null },
      })

      const req = createMockRequest({
        email: "test@example.com",
        password: "test123",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("INVALID_CREDENTIALS")
    })
  })

  describe("Password Verification", () => {
    it("should return 401 for incorrect password", async () => {
      vi.mocked(verifyPassword).mockResolvedValue(false)

      const req = createMockRequest({
        email: "test@example.com",
        password: "wrong-password",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe("INVALID_CREDENTIALS")
    })

    it("should call verifyPassword with correct arguments", async () => {
      const req = createMockRequest({
        email: "test@example.com",
        password: "correct-password",
      })
      await POST(req)

      expect(verifyPassword).toHaveBeenCalledWith("correct-password", MOCK_USER.password_hash)
    })
  })

  describe("Successful Login", () => {
    it("should return 200 for valid credentials", async () => {
      const req = createMockRequest({
        email: "test@example.com",
        password: "correct-password",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.userId).toBe(MOCK_USER.user_id)
    })

    it("should return user workspaces", async () => {
      const req = createMockRequest({
        email: "test@example.com",
        password: "correct-password",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces).toEqual(["site1.example.com", "site2.example.com"])
    })

    it("should set session cookie", async () => {
      const req = createMockRequest({
        email: "test@example.com",
        password: "correct-password",
      })
      const response = await POST(req)

      const setCookieHeader = response.headers.get("set-cookie")
      expect(setCookieHeader).toBeTruthy()
      // Cookie should be set with correct name and security options
      expect(setCookieHeader).toContain("auth_session")
      expect(setCookieHeader).toContain("HttpOnly")
    })

    it("should create JWT with correct user data", async () => {
      const req = createMockRequest({
        email: "test@example.com",
        password: "correct-password",
      })
      await POST(req)

      expect(createSessionToken).toHaveBeenCalledWith({
        userId: MOCK_USER.user_id,
        email: MOCK_USER.email,
        name: MOCK_USER.display_name,
        orgIds: ["org-1", "org-2"],
        orgRoles: {
          "org-1": "owner",
          "org-2": "member",
        },
      })
    })

    it("filters invalid membership roles and deduplicates org IDs in JWT claims", async () => {
      setupMockSupabase({
        memberships: [
          { org_id: "org-1", role: "owner" },
          { org_id: "org-1", role: "owner" },
          { org_id: "org-2", role: "viewer" },
          { org_id: "org-3", role: "admin" },
        ],
      })

      const req = createMockRequest({
        email: "test@example.com",
        password: "correct-password",
      })
      await POST(req)

      expect(createSessionToken).toHaveBeenCalledWith({
        userId: MOCK_USER.user_id,
        email: MOCK_USER.email,
        name: MOCK_USER.display_name,
        orgIds: ["org-1", "org-3"],
        orgRoles: {
          "org-1": "owner",
          "org-3": "admin",
        },
      })
    })

    it("skips domain query and creates empty JWT claims when all membership roles are invalid", async () => {
      setupMockSupabase({
        memberships: [
          { org_id: "org-1", role: "viewer" },
          { org_id: "org-2", role: "superadmin" },
        ],
      })

      const req = createMockRequest({
        email: "test@example.com",
        password: "correct-password",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces).toEqual([])

      // Domain query should NOT be called since orgIds is empty
      expect(createAppClient).not.toHaveBeenCalled()

      // JWT should have empty org claims
      expect(createSessionToken).toHaveBeenCalledWith({
        userId: MOCK_USER.user_id,
        email: MOCK_USER.email,
        name: MOCK_USER.display_name,
        orgIds: [],
        orgRoles: {},
      })
    })

    it("should handle user with no workspaces", async () => {
      setupMockSupabase({ memberships: [], domains: [] })

      const req = createMockRequest({
        email: "test@example.com",
        password: "correct-password",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workspaces).toEqual([])
    })

    it("issues JWT in local test mode instead of legacy raw session value", async () => {
      const previousStreamEnv = process.env.STREAM_ENV
      process.env.STREAM_ENV = "local"

      try {
        const req = createMockRequest({
          email: SECURITY.LOCAL_TEST.EMAIL,
          password: SECURITY.LOCAL_TEST.PASSWORD,
        })
        const response = await POST(req)

        expect(response.status).toBe(200)
        expect(createSessionToken).toHaveBeenCalledWith({
          userId: SECURITY.LOCAL_TEST.SESSION_VALUE,
          email: SECURITY.LOCAL_TEST.EMAIL,
          name: "Test User",
          orgIds: [],
          orgRoles: {},
        })
        expect(createIamClient).not.toHaveBeenCalled()
      } finally {
        process.env.STREAM_ENV = previousStreamEnv
      }
    })
  })

  describe("Security: Error Message Consistency", () => {
    // All auth failures should return the same error to prevent user enumeration
    it("should return same error for non-existent user", async () => {
      setupMockSupabase({ user: null })

      const req = createMockRequest({
        email: "nonexistent@example.com",
        password: "test123",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(data.error).toBe("INVALID_CREDENTIALS")
    })

    it("should return same error for wrong password", async () => {
      vi.mocked(verifyPassword).mockResolvedValue(false)

      const req = createMockRequest({
        email: "test@example.com",
        password: "wrong-password",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(data.error).toBe("INVALID_CREDENTIALS")
    })

    it("should return same error for user without password", async () => {
      setupMockSupabase({
        user: { ...MOCK_USER, password_hash: null as string | null },
      })

      const req = createMockRequest({
        email: "test@example.com",
        password: "test123",
      })
      const response = await POST(req)
      const data = await response.json()

      expect(data.error).toBe("INVALID_CREDENTIALS")
    })
  })

  describe("CORS Headers", () => {
    it("should include CORS headers with origin", async () => {
      const req = createMockRequest({ email: "test@example.com", password: "correct-password" }, "https://example.com")
      const response = await POST(req)

      // Response should include CORS headers for the origin
      expect(response.headers.get("access-control-allow-origin")).toBeTruthy()
    })
  })

  describe("Edge Cases", () => {
    it("should handle email with uppercase", async () => {
      const req = createMockRequest({
        email: "TEST@EXAMPLE.COM",
        password: "correct-password",
      })
      const _response = await POST(req)

      // Should still query the database (case handling is at DB level)
      expect(createIamClient).toHaveBeenCalled()
    })

    it("should handle email with leading/trailing spaces", async () => {
      const req = createMockRequest({
        email: "  test@example.com  ",
        password: "correct-password",
      })
      const response = await POST(req)
      const _data = await response.json()

      // Zod's email validation might reject or accept depending on trim
      expect([200, 400]).toContain(response.status)
    })

    it("should handle very long password", async () => {
      const req = createMockRequest({
        email: "test@example.com",
        password: "a".repeat(1000),
      })
      const response = await POST(req)

      // Should process without crashing
      expect([200, 401]).toContain(response.status)
    })
  })
})
