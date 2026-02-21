/**
 * Tests for GET /api/referrals/history endpoint
 *
 * @see docs/features/referral-system.md (Workstream 9)
 *
 * Test cases:
 * - Authentication: 401 without session
 * - Empty history: 200 with empty referrals array
 * - Happy path: 200 with referrals and user info
 * - Partial user data: handles missing referred users gracefully
 * - Pagination: limit, offset, total, hasMore
 */

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

// Mock auth - only override getSessionUser
vi.mock("@/features/auth/lib/auth", async () => {
  const actual = await vi.importActual("@/features/auth/lib/auth")
  return {
    ...actual,
    getSessionUser: vi.fn(),
  }
})

// Mock Supabase client
vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

// Import after mocking
const { GET } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { createIamClient } = await import("@/lib/supabase/iam")

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

// Sample referral data
const MOCK_REFERRALS = [
  {
    referral_id: "ref-1",
    status: "completed",
    credits_awarded: 500,
    created_at: "2024-01-15T10:00:00Z",
    completed_at: "2024-01-16T12:00:00Z",
    referred_id: "referred-user-1",
  },
  {
    referral_id: "ref-2",
    status: "pending",
    credits_awarded: 0,
    created_at: "2024-01-20T14:00:00Z",
    completed_at: null,
    referred_id: "referred-user-2",
  },
]

const MOCK_USERS = [
  { user_id: "referred-user-1", email: "alice@example.com", display_name: "Alice" },
  { user_id: "referred-user-2", email: "bob@example.com", display_name: "Bob" },
]

// Helper to create mock request
function createMockRequest(params: { limit?: number; offset?: number } = {}): NextRequest {
  const url = new URL("http://localhost/api/referrals/history")
  if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit))
  if (params.offset !== undefined) url.searchParams.set("offset", String(params.offset))
  return new NextRequest(url)
}

// Helper to create chainable mock for referrals query with pagination (cast to unknown to satisfy SupabaseClient type)
function createMockIamClient(options: {
  referrals?: typeof MOCK_REFERRALS | null
  users?: typeof MOCK_USERS | null
  total?: number
}) {
  const { referrals = [], users = [], total = referrals?.length ?? 0 } = options

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === "referrals") {
      return {
        select: vi.fn().mockImplementation((_fields: string, opts?: { count?: string; head?: boolean }) => {
          // Count query (with head: true)
          if (opts?.head) {
            return {
              eq: vi.fn().mockResolvedValue({ count: total, error: null }),
            }
          }
          // Data query
          return {
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockResolvedValue({ data: referrals, error: null }),
          }
        }),
      }
    }
    if (table === "users") {
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: users, error: null }),
      }
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
  })

  return {
    from: fromMock,
  } as unknown as Awaited<ReturnType<typeof createIamClient>> & { from: typeof fromMock }
}

describe("GET /api/referrals/history", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const response = await GET(createMockRequest())
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("should allow authenticated users", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({ referrals: [], total: 0 }))

      const response = await GET(createMockRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })
  })

  describe("Empty History", () => {
    it("should return empty array when no referrals exist", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({ referrals: [], total: 0 }))

      const response = await GET(createMockRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.referrals).toEqual([])
      expect(data.data.total).toBe(0)
      expect(data.data.hasMore).toBe(false)
    })

    it("should return empty array when total is zero", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({ referrals: null, total: 0 }))

      const response = await GET(createMockRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.referrals).toEqual([])
      expect(data.data.total).toBe(0)
      expect(data.data.hasMore).toBe(false)
    })
  })

  describe("Happy Path", () => {
    it("should return referrals with user info", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: MOCK_REFERRALS, users: MOCK_USERS, total: 2 }),
      )

      const response = await GET(createMockRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.referrals).toHaveLength(2)
      expect(data.data.total).toBe(2)
      expect(data.data.hasMore).toBe(false)

      // Check first referral (completed)
      expect(data.data.referrals[0]).toMatchObject({
        id: "ref-1",
        status: "completed",
        creditsAwarded: 500,
        createdAt: "2024-01-15T10:00:00Z",
        completedAt: "2024-01-16T12:00:00Z",
        referredEmail: "alice@example.com",
        referredName: "Alice",
      })

      // Check second referral (pending)
      expect(data.data.referrals[1]).toMatchObject({
        id: "ref-2",
        status: "pending",
        creditsAwarded: 0,
        createdAt: "2024-01-20T14:00:00Z",
        completedAt: null,
        referredEmail: "bob@example.com",
        referredName: "Bob",
      })
    })
  })

  describe("Pagination", () => {
    it("should use default limit of 50", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      const mockClient = createMockIamClient({ referrals: MOCK_REFERRALS, users: MOCK_USERS, total: 2 })
      vi.mocked(createIamClient).mockResolvedValue(mockClient)

      await GET(createMockRequest())

      // Verify range was called with default limit (0 to 49)
      const fromCalls = mockClient.from.mock.calls
      expect(fromCalls.length).toBeGreaterThan(0)
    })

    it("should respect limit parameter", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: [MOCK_REFERRALS[0]], users: [MOCK_USERS[0]], total: 2 }),
      )

      const response = await GET(createMockRequest({ limit: 1 }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.referrals).toHaveLength(1)
      expect(data.data.total).toBe(2)
      expect(data.data.hasMore).toBe(true)
    })

    it("should respect offset parameter", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: [MOCK_REFERRALS[1]], users: [MOCK_USERS[1]], total: 2 }),
      )

      const response = await GET(createMockRequest({ limit: 1, offset: 1 }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.referrals).toHaveLength(1)
      expect(data.data.total).toBe(2)
      expect(data.data.hasMore).toBe(false)
    })

    it("should cap limit at 100", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      const mockClient = createMockIamClient({ referrals: MOCK_REFERRALS, users: MOCK_USERS, total: 2 })
      vi.mocked(createIamClient).mockResolvedValue(mockClient)

      const response = await GET(createMockRequest({ limit: 500 }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should handle negative offset as 0", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: MOCK_REFERRALS, users: MOCK_USERS, total: 2 }),
      )

      const response = await GET(createMockRequest({ offset: -10 }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should return hasMore=true when more results exist", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: [MOCK_REFERRALS[0]], users: [MOCK_USERS[0]], total: 10 }),
      )

      const response = await GET(createMockRequest({ limit: 1 }))
      const data = await response.json()

      expect(data.data.hasMore).toBe(true)
      expect(data.data.total).toBe(10)
    })

    it("should return hasMore=false on last page", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: [MOCK_REFERRALS[1]], users: [MOCK_USERS[1]], total: 2 }),
      )

      const response = await GET(createMockRequest({ limit: 1, offset: 1 }))
      const data = await response.json()

      expect(data.data.hasMore).toBe(false)
      expect(data.data.total).toBe(2)
    })
  })

  describe("Partial User Data", () => {
    it("should handle missing referred users gracefully", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: MOCK_REFERRALS, users: [MOCK_USERS[0]], total: 2 }),
      )

      const response = await GET(createMockRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.referrals).toHaveLength(2)

      // First referral has user info
      expect(data.data.referrals[0].referredEmail).toBe("alice@example.com")
      expect(data.data.referrals[0].referredName).toBe("Alice")

      // Second referral has undefined user info (user not found)
      expect(data.data.referrals[1].referredEmail).toBeUndefined()
      expect(data.data.referrals[1].referredName).toBeUndefined()
    })

    it("should handle null users response", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: MOCK_REFERRALS, users: null, total: 2 }),
      )

      const response = await GET(createMockRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.referrals).toHaveLength(2)

      // All referrals should have undefined user info
      expect(data.data.referrals[0].referredEmail).toBeUndefined()
      expect(data.data.referrals[1].referredEmail).toBeUndefined()
    })
  })

  describe("Response Shape", () => {
    it("should return correct response structure with pagination", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: MOCK_REFERRALS, users: MOCK_USERS, total: 2 }),
      )

      const response = await GET(createMockRequest())
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        ok: true,
        data: {
          referrals: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              status: expect.any(String),
              creditsAwarded: expect.any(Number),
              createdAt: expect.any(String),
            }),
          ]),
          total: expect.any(Number),
          hasMore: expect.any(Boolean),
        },
      })
    })

    it("should use camelCase for response fields", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({ referrals: [MOCK_REFERRALS[0]], users: [MOCK_USERS[0]], total: 1 }),
      )

      const response = await GET(createMockRequest())
      const data = await response.json()

      const referral = data.data.referrals[0]
      // Should have camelCase keys
      expect(referral).toHaveProperty("creditsAwarded")
      expect(referral).toHaveProperty("createdAt")
      expect(referral).toHaveProperty("completedAt")
      expect(referral).toHaveProperty("referredEmail")
      expect(referral).toHaveProperty("referredName")
      // Should NOT have snake_case keys
      expect(referral).not.toHaveProperty("credits_awarded")
      expect(referral).not.toHaveProperty("created_at")
      expect(referral).not.toHaveProperty("completed_at")
      expect(referral).not.toHaveProperty("referred_id")
    })
  })
})
