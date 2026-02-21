/**
 * Tests for POST /api/referrals/complete-pending endpoint
 *
 * @see docs/features/referral-system.md (Workstream 11)
 *
 * Test cases:
 * - Authentication: 401 with wrong/missing secret
 * - Input validation: 400 for malformed JSON and missing userId
 * - No pending referral: 200 with ok: false
 * - Both credit awards failed: 500, keeps referral pending for retry
 * - Update failure (after credits awarded): 500
 * - Happy path: 200 with completed referral
 * - Partial credit award: Still returns 200 but logs warning
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

// Store original env
const originalEnv = process.env.INTERNAL_WEBHOOK_SECRET

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

// Mock add-credits module
vi.mock("@/lib/credits/add-credits", () => ({
  awardReferralCredits: vi.fn(),
}))

// Import after mocking
const { POST, referralDedupeCache } = await import("../route")
const { createIamClient } = await import("@/lib/supabase/iam")
const { awardReferralCredits } = await import("@/lib/credits/add-credits")

// Test constants
const TEST_SECRET = "test-webhook-secret-123"
const TEST_USER_ID = "user-referred-123"
const TEST_REFERRER_ID = "user-referrer-456"
const TEST_REFERRAL_ID = "referral-789"

// Helper to create mock request
function mockRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/referrals/complete-pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function mockRequestWithMalformedJson(): Request {
  return new Request("http://localhost:3000/api/referrals/complete-pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json {{{",
  })
}

// Helper to create chainable Supabase mock (cast to unknown to satisfy SupabaseClient type)
function createMockIamClient(options: {
  pendingReferral?: {
    referral_id: string
    referrer_id: string
    referred_id: string
    credits_awarded: number
  } | null
  updateError?: { message: string } | null
}) {
  const { pendingReferral = null, updateError = null } = options

  return {
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: pendingReferral, error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      }),
    })),
  } as unknown as Awaited<ReturnType<typeof createIamClient>>
}

describe("POST /api/referrals/complete-pending", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_WEBHOOK_SECRET = TEST_SECRET
    // Clear dedupe cache between tests to prevent test interference
    referralDedupeCache.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_WEBHOOK_SECRET = originalEnv
  })

  describe("Authentication", () => {
    it("should return 401 when secret is missing", async () => {
      const req = mockRequest({ userId: TEST_USER_ID })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("should return 401 when secret is wrong", async () => {
      const req = mockRequest({ userId: TEST_USER_ID, secret: "wrong-secret" })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("should accept correct secret", async () => {
      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({ pendingReferral: null }))

      const req = mockRequest({ userId: TEST_USER_ID, secret: TEST_SECRET })
      const response = await POST(req)

      // Should not be 401 - might be ok: false due to no pending referral
      expect(response.status).not.toBe(401)
    })
  })

  describe("Input Validation", () => {
    it("should return 400 for malformed JSON body", async () => {
      const req = mockRequestWithMalformedJson()
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.INVALID_JSON)
    })

    it("should return 400 when userId is missing", async () => {
      const req = mockRequest({ secret: TEST_SECRET })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.INVALID_REQUEST)
    })

    it("should return 400 when userId is not a string", async () => {
      const req = mockRequest({ secret: TEST_SECRET, userId: 12345 })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.INVALID_REQUEST)
    })
  })

  describe("No Pending Referral", () => {
    it("should return ok: false when no pending referral exists", async () => {
      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({ pendingReferral: null }))

      const req = mockRequest({ userId: TEST_USER_ID, secret: TEST_SECRET })
      const response = await POST(req)
      const data = await response.json()

      // Note: Returns 200 with ok: false (not an error condition)
      expect(response.status).toBe(200)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_NOT_FOUND)
    })
  })

  describe("Credit Award Failure", () => {
    it("should return 500 when both credit awards fail (keeps referral pending)", async () => {
      const pendingReferral = {
        referral_id: TEST_REFERRAL_ID,
        referrer_id: TEST_REFERRER_ID,
        referred_id: TEST_USER_ID,
        credits_awarded: 500,
      }

      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({ pendingReferral, updateError: null }))
      vi.mocked(awardReferralCredits).mockResolvedValue({
        referrerResult: { success: false, error: "no_org" },
        referredResult: { success: false, error: "no_org" },
      })

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const req = mockRequest({ userId: TEST_USER_ID, secret: TEST_SECRET })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_CREDIT_FAILED)

      // Should log error about both failing
      expect(errorSpy).toHaveBeenCalledWith(
        "[Referral] Both credit awards failed - keeping referral pending:",
        expect.objectContaining({ referralId: TEST_REFERRAL_ID }),
      )

      errorSpy.mockRestore()
    })
  })

  describe("Update Failure", () => {
    it("should return 500 when referral update fails (after credits awarded)", async () => {
      const pendingReferral = {
        referral_id: TEST_REFERRAL_ID,
        referrer_id: TEST_REFERRER_ID,
        referred_id: TEST_USER_ID,
        credits_awarded: 500,
      }

      vi.mocked(createIamClient).mockResolvedValue(
        createMockIamClient({
          pendingReferral,
          updateError: { message: "Database error" },
        }),
      )
      // Credits succeed but update fails
      vi.mocked(awardReferralCredits).mockResolvedValue({
        referrerResult: { success: true, orgId: "org-1", newBalance: 1500 },
        referredResult: { success: true, orgId: "org-2", newBalance: 500 },
      })

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const req = mockRequest({ userId: TEST_USER_ID, secret: TEST_SECRET })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.INTERNAL_ERROR)

      // Should log that credits were awarded but status update failed
      expect(errorSpy).toHaveBeenCalledWith(
        "[Referral] Credits awarded but status update failed:",
        expect.objectContaining({ referralId: TEST_REFERRAL_ID }),
      )

      errorSpy.mockRestore()
    })
  })

  describe("Happy Path", () => {
    it("should complete pending referral and award credits", async () => {
      const pendingReferral = {
        referral_id: TEST_REFERRAL_ID,
        referrer_id: TEST_REFERRER_ID,
        referred_id: TEST_USER_ID,
        credits_awarded: 500,
      }

      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({ pendingReferral, updateError: null }))
      vi.mocked(awardReferralCredits).mockResolvedValue({
        referrerResult: { success: true, orgId: "org-1", newBalance: 1500 },
        referredResult: { success: true, orgId: "org-2", newBalance: 500 },
      })

      const req = mockRequest({ userId: TEST_USER_ID, secret: TEST_SECRET })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.data.referralId).toBe(TEST_REFERRAL_ID)
      expect(data.data.creditsAwarded).toBe(500)

      // Verify awardReferralCredits was called correctly
      expect(awardReferralCredits).toHaveBeenCalledWith(TEST_REFERRER_ID, TEST_USER_ID, 500)
    })
  })

  describe("Partial Credit Award", () => {
    it("should still return success even with partial credit award", async () => {
      const pendingReferral = {
        referral_id: TEST_REFERRAL_ID,
        referrer_id: TEST_REFERRER_ID,
        referred_id: TEST_USER_ID,
        credits_awarded: 500,
      }

      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({ pendingReferral, updateError: null }))
      vi.mocked(awardReferralCredits).mockResolvedValue({
        referrerResult: { success: true, orgId: "org-1", newBalance: 1500 },
        referredResult: { success: false, error: "no_org" }, // Referred user has no org
      })

      // Spy on console.warn
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

      const req = mockRequest({ userId: TEST_USER_ID, secret: TEST_SECRET })
      const response = await POST(req)
      const data = await response.json()

      // Should still return success (referral was completed)
      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)

      // Should log warning about partial award
      expect(warnSpy).toHaveBeenCalledWith(
        "[Referral] Partial credit award on complete-pending:",
        expect.objectContaining({
          referralId: TEST_REFERRAL_ID,
        }),
      )

      warnSpy.mockRestore()
    })
  })

  describe("Response Shape", () => {
    it("should return correct response structure on success", async () => {
      const pendingReferral = {
        referral_id: TEST_REFERRAL_ID,
        referrer_id: TEST_REFERRER_ID,
        referred_id: TEST_USER_ID,
        credits_awarded: 500,
      }

      vi.mocked(createIamClient).mockResolvedValue(createMockIamClient({ pendingReferral, updateError: null }))
      vi.mocked(awardReferralCredits).mockResolvedValue({
        referrerResult: { success: true },
        referredResult: { success: true },
      })

      const req = mockRequest({ userId: TEST_USER_ID, secret: TEST_SECRET })
      const response = await POST(req)
      const data = await response.json()

      expect(data).toMatchObject({
        ok: true,
        data: {
          referralId: expect.any(String),
          creditsAwarded: expect.any(Number),
        },
      })
    })
  })
})
