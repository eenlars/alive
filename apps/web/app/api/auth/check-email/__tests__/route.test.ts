/**
 * Tests for POST /api/auth/check-email endpoint
 *
 * Security-critical tests:
 * - Rate limiting to prevent email enumeration attacks
 * - Valid email format validation
 * - Proper error responses
 */

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

// Mock the IAM client
vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

// Mock rate limiter to control rate limiting behavior in tests
vi.mock("@/lib/auth/rate-limiter", () => ({
  emailCheckRateLimiter: {
    isRateLimited: vi.fn(),
    getBlockedTimeRemaining: vi.fn(),
    recordFailedAttempt: vi.fn(),
  },
}))

// Import after mocking
const { POST, OPTIONS } = await import("../route")
const { createIamClient } = await import("@/lib/supabase/iam")
const { emailCheckRateLimiter } = await import("@/lib/auth/rate-limiter")

// Helper to create mock NextRequest
function createMockRequest(body: Record<string, unknown> | string): NextRequest {
  const isString = typeof body === "string"
  return new NextRequest("http://localhost/api/auth/check-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://test.test.local",
      "x-forwarded-for": "192.168.1.100",
    },
    body: isString ? body : JSON.stringify(body),
  })
}

// Helper to create mock IAM client (cast to unknown to satisfy SupabaseClient type)
function createMockIam(userExists: boolean) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue(
              userExists ? { data: { user_id: "user-123" }, error: null } : { data: null, error: { code: "PGRST116" } },
            ),
        }),
      }),
    }),
  } as unknown as Awaited<ReturnType<typeof createIamClient>>
}

describe("POST /api/auth/check-email", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: not rate limited
    vi.mocked(emailCheckRateLimiter.isRateLimited).mockReturnValue(false)
    vi.mocked(emailCheckRateLimiter.getBlockedTimeRemaining).mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Rate Limiting", () => {
    /**
     * RATE LIMIT TEST - Should return 429 when rate limited
     */
    it("should return 429 when rate limited", async () => {
      vi.mocked(emailCheckRateLimiter.isRateLimited).mockReturnValue(true)
      vi.mocked(emailCheckRateLimiter.getBlockedTimeRemaining).mockReturnValue(5 * 60 * 1000) // 5 minutes

      const req = createMockRequest({ email: "test@example.com" })

      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(429)
      expect(json.ok).toBe(false)
      expect(json.error).toBe(ErrorCodes.TOO_MANY_REQUESTS)
      expect(json.message).toContain("5 minutes")
    })

    /**
     * RATE LIMIT - Singular minute message
     */
    it("should use singular 'minute' when 1 minute remaining", async () => {
      vi.mocked(emailCheckRateLimiter.isRateLimited).mockReturnValue(true)
      vi.mocked(emailCheckRateLimiter.getBlockedTimeRemaining).mockReturnValue(45 * 1000) // 45 seconds = rounds up to 1 minute

      const req = createMockRequest({ email: "test@example.com" })

      const res = await POST(req)
      const json = await res.json()

      expect(json.message).toContain("1 minute.")
      expect(json.message).not.toContain("minutes")
    })

    /**
     * RATE LIMIT - Should record attempt on every request
     */
    it("should record attempt on successful requests", async () => {
      vi.mocked(createIamClient).mockResolvedValue(createMockIam(false))

      const req = createMockRequest({ email: "test@example.com" })

      await POST(req)

      expect(emailCheckRateLimiter.recordFailedAttempt).toHaveBeenCalled()
    })

    /**
     * RATE LIMIT - Should NOT record attempt when rate limited
     * (because we return early before recording)
     */
    it("should not record additional attempt when already rate limited", async () => {
      vi.mocked(emailCheckRateLimiter.isRateLimited).mockReturnValue(true)
      vi.mocked(emailCheckRateLimiter.getBlockedTimeRemaining).mockReturnValue(5 * 60 * 1000)

      const req = createMockRequest({ email: "test@example.com" })

      await POST(req)

      expect(emailCheckRateLimiter.recordFailedAttempt).not.toHaveBeenCalled()
    })
  })

  describe("Happy Path", () => {
    /**
     * EMAIL EXISTS - Should return exists: true
     */
    it("should return exists: true for existing email", async () => {
      vi.mocked(createIamClient).mockResolvedValue(createMockIam(true))

      const req = createMockRequest({ email: "existing@example.com" })

      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.exists).toBe(true)
      expect(json.email).toBe("existing@example.com")
      expect(json.requestId).toBeDefined()
    })

    /**
     * EMAIL DOES NOT EXIST - Should return exists: false
     */
    it("should return exists: false for non-existing email", async () => {
      vi.mocked(createIamClient).mockResolvedValue(createMockIam(false))

      const req = createMockRequest({ email: "new@example.com" })

      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.ok).toBe(true)
      expect(json.exists).toBe(false)
      expect(json.email).toBe("new@example.com")
    })

    /**
     * EMAIL NORMALIZATION - Should lowercase email
     */
    it("should normalize email to lowercase", async () => {
      vi.mocked(createIamClient).mockResolvedValue(createMockIam(false))

      const req = createMockRequest({ email: "TEST@EXAMPLE.COM" })

      const res = await POST(req)
      const json = await res.json()

      expect(json.email).toBe("test@example.com")
    })
  })

  describe("Validation", () => {
    /**
     * INVALID EMAIL FORMAT - Should reject invalid emails
     */
    it("should reject invalid email format", async () => {
      const req = createMockRequest({ email: "not-an-email" })

      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.ok).toBe(false)
      expect(json.error).toBe(ErrorCodes.INVALID_REQUEST)
    })

    /**
     * MISSING EMAIL - Should reject missing email
     */
    it("should reject missing email", async () => {
      const req = createMockRequest({})

      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.ok).toBe(false)
      expect(json.error).toBe(ErrorCodes.INVALID_REQUEST)
    })

    /**
     * INVALID JSON - Should handle malformed JSON
     */
    it("should handle malformed JSON", async () => {
      const req = createMockRequest("not valid json{")

      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.ok).toBe(false)
      expect(json.error).toBe(ErrorCodes.INVALID_JSON)
    })
  })

  describe("Error Handling", () => {
    /**
     * DATABASE ERROR - Should handle database errors gracefully
     */
    it("should handle database errors", async () => {
      vi.mocked(createIamClient).mockRejectedValue(new Error("Database connection failed"))

      const req = createMockRequest({ email: "test@example.com" })

      const res = await POST(req)
      const json = await res.json()

      expect(res.status).toBe(500)
      expect(json.ok).toBe(false)
      expect(json.error).toBe(ErrorCodes.INTERNAL_ERROR)
    })
  })

  describe("CORS", () => {
    /**
     * CORS HEADERS - Should include CORS headers in response
     */
    it("should include CORS headers", async () => {
      vi.mocked(createIamClient).mockResolvedValue(createMockIam(false))

      const req = createMockRequest({ email: "test@example.com" })

      const res = await POST(req)

      expect(res.headers.has("Access-Control-Allow-Origin")).toBe(true)
    })
  })
})

describe("OPTIONS /api/auth/check-email", () => {
  /**
   * CORS PREFLIGHT - Should handle OPTIONS requests
   */
  it("should handle CORS preflight requests", async () => {
    const req = new NextRequest("http://localhost/api/auth/check-email", {
      method: "OPTIONS",
      headers: {
        origin: "https://test.test.local",
      },
    })

    const res = await OPTIONS(req)

    expect(res.status).toBe(200)
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(true)
  })
})
