/**
 * Tests for GET /api/referrals/me endpoint
 *
 * @see docs/features/referral-system.md (Workstream 6)
 *
 * Test cases:
 * - Authentication: 401 without session
 * - RPC error: 500 when get_or_create_invite_code fails
 * - User not found: 404 when RPC returns null
 * - Happy path (no referrals): 200 with invite code and zero stats
 * - Happy path (with referrals): 200 with invite code and actual stats
 */

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

// Mock generateInviteCode - only mock the function we need, keep real exports
vi.mock("@webalive/shared", async importOriginal => {
  const actual = await importOriginal<typeof import("@webalive/shared")>()
  return {
    ...actual,
    generateInviteCode: vi.fn(() => "TEST123ABC"),
  }
})

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

const ORIGINAL_NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL

// Helper to create chainable mock that simulates Supabase query behavior (cast to unknown to satisfy SupabaseClient type)
function createDetailedIamMock(options: {
  rpcResult?: { data: string | null; error: { message: string } | null }
  completedCount?: number
  referrals?: Array<{ credits_awarded: number }>
}) {
  const { rpcResult, completedCount = 0, referrals = [] } = options

  return {
    rpc: vi.fn().mockResolvedValue(rpcResult ?? { data: "TEST123ABC", error: null }),
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockImplementation((_fields: string, opts?: { count?: string; head?: boolean }) => {
        // Create the result based on query type
        const result = opts?.head
          ? { count: completedCount, data: null, error: null }
          : { data: referrals, error: null }

        // Create a thenable chainable object (Supabase queries are both chainable and awaitable)
        const createThenable = () => {
          const thenable = Promise.resolve(result) as Promise<typeof result> & { eq: ReturnType<typeof vi.fn> }
          thenable.eq = vi.fn().mockImplementation(() => createThenable())
          return thenable
        }

        return createThenable()
      }),
    })),
  } as unknown as Awaited<ReturnType<typeof createIamClient>>
}

describe("GET /api/referrals/me", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test"
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (ORIGINAL_NEXT_PUBLIC_APP_URL === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_NEXT_PUBLIC_APP_URL
    }
  })

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("should allow authenticated users", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createDetailedIamMock({ rpcResult: { data: "ABC123", error: null } }),
      )

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
    })
  })

  describe("Invite Code Generation", () => {
    it("should return 500 when RPC fails", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createDetailedIamMock({
          rpcResult: { data: null, error: { message: "Database connection failed" } },
        }),
      )

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.INTERNAL_ERROR)
    })

    it("should return 404 when user not found (RPC returns null)", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(createDetailedIamMock({ rpcResult: { data: null, error: null } }))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.USER_NOT_FOUND)
    })

    it("should return invite code from RPC", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createDetailedIamMock({ rpcResult: { data: "MYCODE123", error: null } }),
      )

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.inviteCode).toBe("MYCODE123")
    })
  })

  describe("Invite Link", () => {
    it("should build invite link from code", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createDetailedIamMock({ rpcResult: { data: "ABC123XYZ", error: null } }),
      )

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.inviteLink).toContain("/invite/ABC123XYZ")
    })
  })

  describe("Referral Stats", () => {
    it("should return zero stats when no referrals", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createDetailedIamMock({
          rpcResult: { data: "CODE123", error: null },
          completedCount: 0,
          referrals: [],
        }),
      )

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.stats.totalReferrals).toBe(0)
      expect(data.data.stats.creditsEarned).toBe(0)
    })

    it("should return correct stats with completed referrals", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createDetailedIamMock({
          rpcResult: { data: "CODE123", error: null },
          completedCount: 3,
          referrals: [{ credits_awarded: 500 }, { credits_awarded: 500 }, { credits_awarded: 500 }],
        }),
      )

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.stats.totalReferrals).toBe(3)
      expect(data.data.stats.creditsEarned).toBe(1500)
    })
  })

  describe("Response Shape", () => {
    it("should return correct response structure", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createDetailedIamMock({
          rpcResult: { data: "TESTCODE", error: null },
          completedCount: 2,
          referrals: [{ credits_awarded: 500 }, { credits_awarded: 500 }],
        }),
      )

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        ok: true,
        data: {
          inviteCode: expect.any(String),
          inviteLink: expect.stringContaining("/invite/"),
          stats: {
            totalReferrals: expect.any(Number),
            creditsEarned: expect.any(Number),
          },
        },
      })
    })
  })
})
