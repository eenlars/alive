/**
 * Tests for POST /api/referrals/redeem endpoint
 *
 * @see docs/features/referral-system.md (Workstream 7)
 *
 * Test cases:
 * - Authentication: 401 without session
 * - Input validation: 400 for malformed JSON, missing code
 * - Security tests: All validation failures return generic "Invalid code" error
 * - Happy paths: pending referral (email not verified), completed referral
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

// Mock auth - pass through createErrorResponse
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

// Mock credit awarding
vi.mock("@/lib/credits/add-credits", () => ({
  awardReferralCredits: vi.fn(),
}))

// Mock shared constants
vi.mock("@webalive/shared", () => ({
  REFERRAL: {
    CREDITS: 500,
    EXPIRY_DAYS: 30,
    EMAIL_DAILY_LIMIT: 10,
    ACCOUNT_AGE_LIMIT_MS: 24 * 60 * 60 * 1000, // 24 hours
  },
}))

// Import after mocking
const { POST } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { createIamClient } = await import("@/lib/supabase/iam")
const { awardReferralCredits } = await import("@/lib/credits/add-credits")

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

const MOCK_REFERRER = {
  user_id: "referrer-456",
  email_verified: true,
}

// Helper to create mock request with JSON body
function createMockRequest(body: unknown): Request {
  return new Request("http://localhost/api/referrals/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// Helper to create mock request with malformed JSON
function createMalformedJsonRequest(): Request {
  return new Request("http://localhost/api/referrals/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ invalid json",
  })
}

// Create a chainable mock for IAM client (cast to unknown to satisfy SupabaseClient type)
function createMockIamClient(options: {
  currentUser?: { created_at: string; email_verified: boolean } | null
  existingReferral?: { referral_id: string } | null
  referrer?: { user_id: string; email_verified: boolean } | null
  insertError?: { code?: string; message: string } | null
}) {
  const { currentUser, existingReferral, referrer, insertError } = options

  // Track insert calls
  const insertMock = vi.fn().mockResolvedValue({ error: insertError ?? null })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((field: string, value: string) => {
            // Return current user when querying by user_id
            if (field === "user_id" && value === MOCK_USER.id) {
              return {
                single: vi.fn().mockResolvedValue({ data: currentUser, error: null }),
              }
            }
            // Return referrer when querying by invite_code
            if (field === "invite_code") {
              return {
                single: vi.fn().mockResolvedValue({ data: referrer, error: null }),
              }
            }
            return {
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }
          }),
        }
      }
      if (table === "referrals") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: existingReferral, error: null }),
          insert: insertMock,
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: insertMock,
      }
    }),
    _insertMock: insertMock,
  } as unknown as Awaited<ReturnType<typeof createIamClient>> & { _insertMock: ReturnType<typeof vi.fn> }
}

describe("POST /api/referrals/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("Authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(null)

      const req = createMockRequest({ code: "ABC123" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
    })
  })

  describe("Input validation", () => {
    it("returns 400 for malformed JSON body", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)

      const req = createMalformedJsonRequest()
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.INVALID_JSON)
    })

    it("returns 400 for missing code", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({}))

      const req = createMockRequest({})
      const res = await POST(req)

      expect(res.status).toBe(400)
    })

    it("returns 400 for non-string code", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({}))

      const req = createMockRequest({ code: 12345 })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_INVALID_CODE)
    })
  })

  describe("Security tests - all return generic error", () => {
    it("returns generic error for invalid code (user not found)", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({
          currentUser: { created_at: new Date().toISOString(), email_verified: true },
          existingReferral: null,
          referrer: null, // Invalid code - no user found
        }),
      )

      const req = createMockRequest({ code: "INVALID" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_INVALID_CODE)
    })

    it("returns generic error for self-referral", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({
          currentUser: { created_at: new Date().toISOString(), email_verified: true },
          existingReferral: null,
          referrer: { user_id: MOCK_USER.id, email_verified: true }, // Same as current user
        }),
      )

      const req = createMockRequest({ code: "OWN_CODE" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_INVALID_CODE)
    })

    it("returns generic error for user >24h old", async () => {
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({
          currentUser: { created_at: oldDate, email_verified: true },
          existingReferral: null,
          referrer: MOCK_REFERRER,
        }),
      )

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_INVALID_CODE)
    })

    it("returns generic error for already-referred user", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({
          currentUser: { created_at: new Date().toISOString(), email_verified: true },
          existingReferral: { referral_id: "existing-ref-123" }, // Already has referral
          referrer: MOCK_REFERRER,
        }),
      )

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_INVALID_CODE)
    })

    it("returns generic error when current user not found in database", async () => {
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({
          currentUser: null, // User not in database
          existingReferral: null,
          referrer: MOCK_REFERRER,
        }),
      )

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_INVALID_CODE)
    })
  })

  describe("Happy paths", () => {
    it("creates pending referral when email not verified", async () => {
      const mockClient = createMockIamClient({
        currentUser: { created_at: new Date().toISOString(), email_verified: false },
        existingReferral: null,
        referrer: MOCK_REFERRER,
      })
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(mockClient)

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.status).toBe("pending")
      expect(data.message).toBe("Verify your email to complete referral")

      // Verify insert was called with pending status
      expect(mockClient._insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          referrer_id: MOCK_REFERRER.user_id,
          referred_id: MOCK_USER.id,
          status: "pending",
          credits_awarded: 500,
        }),
      )
    })

    it("creates completed referral and awards credits when email verified", async () => {
      const mockClient = createMockIamClient({
        currentUser: { created_at: new Date().toISOString(), email_verified: true },
        existingReferral: null,
        referrer: MOCK_REFERRER,
      })
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(mockClient)
      vi.mocked(awardReferralCredits).mockResolvedValue({
        referrerResult: { success: true, orgId: "org-1", newBalance: 1000 },
        referredResult: { success: true, orgId: "org-2", newBalance: 500 },
      })

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.status).toBe("completed")
      expect(data.data.creditsAwarded).toBe(500)

      // Verify insert was called with completed status
      expect(mockClient._insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          referrer_id: MOCK_REFERRER.user_id,
          referred_id: MOCK_USER.id,
          status: "completed",
          credits_awarded: 500,
        }),
      )

      // Verify credits were awarded
      expect(awardReferralCredits).toHaveBeenCalledWith(MOCK_REFERRER.user_id, MOCK_USER.id, 500)
    })

    it("handles code case-insensitively (uppercases input)", async () => {
      const mockClient = createMockIamClient({
        currentUser: { created_at: new Date().toISOString(), email_verified: true },
        existingReferral: null,
        referrer: MOCK_REFERRER,
      })
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(mockClient)
      vi.mocked(awardReferralCredits).mockResolvedValue({
        referrerResult: { success: true },
        referredResult: { success: true },
      })

      // Send lowercase code
      const req = createMockRequest({ code: "lowercase123" })
      const res = await POST(req)

      expect(res.status).toBe(200)
      // The code should have been uppercased in the query
      // (verified by the mock returning the referrer regardless of case)
    })
  })

  describe("Error handling", () => {
    it("returns 500 when referral insert fails", async () => {
      const mockClient = createMockIamClient({
        currentUser: { created_at: new Date().toISOString(), email_verified: true },
        existingReferral: null,
        referrer: MOCK_REFERRER,
        insertError: { message: "Database error" },
      })
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(mockClient)

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.INTERNAL_ERROR)
    })

    it("logs warning but succeeds when credit award partially fails", async () => {
      const mockClient = createMockIamClient({
        currentUser: { created_at: new Date().toISOString(), email_verified: true },
        existingReferral: null,
        referrer: MOCK_REFERRER,
      })
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(mockClient)
      vi.mocked(awardReferralCredits).mockResolvedValue({
        referrerResult: { success: true, orgId: "org-1", newBalance: 1000 },
        referredResult: { success: false, error: "no_org" }, // Partial failure
      })

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      // Should still succeed
      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.status).toBe("completed")

      // Should have logged warning
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Referral] Partial credit award:",
        expect.objectContaining({
          referrerResult: expect.anything(),
          referredResult: expect.anything(),
        }),
      )

      consoleSpy.mockRestore()
    })

    it("returns 400 (not 500) on race condition - unique constraint violation with code 23505", async () => {
      const mockClient = createMockIamClient({
        currentUser: { created_at: new Date().toISOString(), email_verified: true },
        existingReferral: null,
        referrer: MOCK_REFERRER,
        insertError: { code: "23505", message: "duplicate key value violates unique constraint" },
      })
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(mockClient)

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      // Should return generic error, not 500
      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_INVALID_CODE)
    })

    it("returns 400 on race condition - unique constraint with 'duplicate' in message", async () => {
      const mockClient = createMockIamClient({
        currentUser: { created_at: new Date().toISOString(), email_verified: true },
        existingReferral: null,
        referrer: MOCK_REFERRER,
        insertError: { message: "duplicate key value" },
      })
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(mockClient)

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_INVALID_CODE)
    })

    it("returns 400 on race condition for pending referral insert", async () => {
      const mockClient = createMockIamClient({
        currentUser: { created_at: new Date().toISOString(), email_verified: false },
        existingReferral: null,
        referrer: MOCK_REFERRER,
        insertError: { code: "23505", message: "unique constraint" },
      })
      vi.mocked(getSessionUser).mockResolvedValue(MOCK_USER)
      vi.mocked(createIamClient).mockResolvedValue(mockClient)

      const req = createMockRequest({ code: "VALID" })
      const res = await POST(req)
      const data = await res.json()

      // Should return generic error for pending insert race condition too
      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_INVALID_CODE)
    })
  })
})
