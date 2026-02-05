/**
 * Tests for POST /api/referrals/send-invite endpoint
 *
 * @see docs/features/referral-system.md (Workstream 8)
 *
 * Test cases:
 * - Authentication: 401 without session
 * - Validation: 400 for invalid email formats
 * - Rate limit: 429 when 10 emails sent in 24h
 * - Duplicate: 400 when already sent to same email
 * - No invite code: 400 when user has no invite code
 * - Email failure: 500 when Loops.so fails
 * - Happy path: 200 and records sent email
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

// Mock email sender
vi.mock("@/lib/email/send-referral-invite", () => ({
  sendReferralInvite: vi.fn(),
}))

// Mock shared constants
vi.mock("@webalive/shared", () => ({
  REFERRAL: {
    CREDITS: 500,
    EXPIRY_DAYS: 30,
    EMAIL_DAILY_LIMIT: 10,
    ACCOUNT_AGE_LIMIT_MS: 24 * 60 * 60 * 1000,
  },
}))

// Mock referral lib
vi.mock("@/lib/referral", () => ({
  buildInviteLink: vi.fn((code: string) => `https://test.local/invite/${code}`),
}))

// Import after mocking
const { POST } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { createIamClient } = await import("@/lib/supabase/iam")
const { sendReferralInvite } = await import("@/lib/email/send-referral-invite")

// Mock user
const MOCK_USER = {
  id: "user-123",
  email: "sender@example.com",
  name: "Test Sender",
  canSelectAnyModel: false,
  isAdmin: false,
  isSuperadmin: false,
}

// Helper to create mock request
function mockRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/referrals/send-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// Helper to create mock request with malformed JSON
function mockRequestWithMalformedJson(): Request {
  return new Request("http://localhost:3000/api/referrals/send-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json {{{",
  })
}

// Helper to create promise-like chainable object
function createPromiseLike<T>(value: T) {
  const promiseLike: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: Required for Supabase query builder mock
    then: (resolve: (v: T) => unknown) => Promise.resolve(resolve(value)),
  }
  // Add chainable methods after creation to avoid self-reference during initialization
  promiseLike.eq = vi.fn().mockReturnValue(promiseLike)
  promiseLike.gte = vi.fn().mockReturnValue(promiseLike)
  return promiseLike
}

// Helper to create chainable mock for Supabase (cast to unknown to satisfy SupabaseClient type)
function createMockIamClient(options: {
  emailCountToday?: number
  existingEmail?: boolean
  senderData?: { display_name: string | null; invite_code: string | null } | null
}) {
  const {
    emailCountToday = 0,
    existingEmail = false,
    senderData = { display_name: "Test User", invite_code: "TESTCODE123" },
  } = options

  const insertMock = vi.fn().mockResolvedValue({ error: null })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "email_invites") {
        return {
          select: vi.fn().mockImplementation((_fields: string, opts?: { count?: string; head?: boolean }) => {
            // Count query (rate limit check)
            if (opts?.head) {
              return createPromiseLike({ count: emailCountToday, data: null, error: null })
            }
            // Duplicate check
            return {
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: existingEmail ? { id: "existing-invite-id" } : null,
                error: existingEmail ? null : { code: "PGRST116" },
              }),
            }
          }),
          insert: insertMock,
        }
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: senderData, error: null }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }),
    _insertMock: insertMock,
  } as unknown as Awaited<ReturnType<typeof createIamClient>> & { _insertMock: ReturnType<typeof vi.fn> }
}

describe("POST /api/referrals/send-invite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("Authentication", () => {
    it("returns 401 when not authenticated", async () => {
      ;(getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const req = mockRequest({ email: "test@example.com" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.UNAUTHORIZED)
    })
  })

  describe("Input Validation", () => {
    beforeEach(() => {
      ;(getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER)
    })

    it("returns 400 for malformed JSON body", async () => {
      const req = mockRequestWithMalformedJson()
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.INVALID_JSON)
    })

    it("returns 400 for invalid email formats", async () => {
      const invalidEmails = ["@", "test@", "@example.com", "test", "", "   ", "test@.com"]

      for (const email of invalidEmails) {
        const req = mockRequest({ email })
        const res = await POST(req)
        const data = await res.json()

        expect(res.status).toBe(400)
        expect(data.ok).toBe(false)
        expect(data.error).toBe(ErrorCodes.VALIDATION_ERROR)
      }
    })

    it("returns 400 for missing email field", async () => {
      const req = mockRequest({})
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.VALIDATION_ERROR)
    })

    it("returns 400 for non-string email", async () => {
      const req = mockRequest({ email: 12345 })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.VALIDATION_ERROR)
    })
  })

  describe("Rate Limiting", () => {
    beforeEach(() => {
      ;(getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER)
    })

    it("returns 429 when rate limit exceeded (10 emails/day)", async () => {
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(createMockIamClient({ emailCountToday: 10 }))

      const req = mockRequest({ email: "new@example.com" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(429)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.TOO_MANY_REQUESTS)
    })

    it("allows when under rate limit", async () => {
      const mockClient = createMockIamClient({ emailCountToday: 9 })
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)
      ;(sendReferralInvite as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })

      const req = mockRequest({ email: "new@example.com" })
      const res = await POST(req)

      expect(res.status).toBe(200)
    })
  })

  describe("Duplicate Email Check", () => {
    beforeEach(() => {
      ;(getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER)
    })

    it("returns 400 for duplicate email invite", async () => {
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(createMockIamClient({ existingEmail: true }))

      const req = mockRequest({ email: "already@sent.com" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.REFERRAL_ALREADY_INVITED)
    })
  })

  describe("Sender Validation", () => {
    beforeEach(() => {
      ;(getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER)
    })

    it("returns 400 when user has no invite code", async () => {
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockIamClient({ senderData: { display_name: "Test", invite_code: null } }),
      )

      const req = mockRequest({ email: "new@example.com" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.VALIDATION_ERROR)
    })

    it("returns 400 when sender not found", async () => {
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(createMockIamClient({ senderData: null }))

      const req = mockRequest({ email: "new@example.com" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.VALIDATION_ERROR)
    })
  })

  describe("Email Sending", () => {
    beforeEach(() => {
      ;(getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER)
    })

    it("returns 500 when email send fails", async () => {
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(createMockIamClient({}))
      ;(sendReferralInvite as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Loops API error"))

      const req = mockRequest({ email: "new@example.com" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe(ErrorCodes.INTERNAL_ERROR)
    })

    it("sends email with correct parameters", async () => {
      const mockClient = createMockIamClient({
        senderData: { display_name: "John Doe", invite_code: "INVITE123" },
      })
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)
      ;(sendReferralInvite as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })

      const req = mockRequest({ email: "recipient@example.com" })
      await POST(req)

      expect(sendReferralInvite).toHaveBeenCalledWith({
        to: "recipient@example.com",
        senderName: "John Doe",
        inviteLink: "https://test.local/invite/INVITE123",
      })
    })

    it("uses 'Someone' when sender has no display name", async () => {
      const mockClient = createMockIamClient({
        senderData: { display_name: null, invite_code: "INVITE123" },
      })
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)
      ;(sendReferralInvite as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })

      const req = mockRequest({ email: "recipient@example.com" })
      await POST(req)

      expect(sendReferralInvite).toHaveBeenCalledWith({
        to: "recipient@example.com",
        senderName: "Someone",
        inviteLink: "https://test.local/invite/INVITE123",
      })
    })
  })

  describe("Success Path", () => {
    beforeEach(() => {
      ;(getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_USER)
    })

    it("successfully sends invite email and returns ok: true", async () => {
      const mockClient = createMockIamClient({})
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)
      ;(sendReferralInvite as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })

      const req = mockRequest({ email: "new@example.com" })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual({ ok: true })
    })

    it("records sent email in database after successful send", async () => {
      const mockClient = createMockIamClient({})
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)
      ;(sendReferralInvite as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })

      const req = mockRequest({ email: "NEW@EXAMPLE.COM" })
      await POST(req)

      // Verify insert was called with lowercase email
      expect(mockClient._insertMock).toHaveBeenCalledWith({
        sender_id: MOCK_USER.id,
        email: "new@example.com",
      })
    })

    it("does not record email if send fails", async () => {
      const mockClient = createMockIamClient({})
      ;(createIamClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)
      ;(sendReferralInvite as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Send failed"))

      const req = mockRequest({ email: "new@example.com" })
      await POST(req)

      // Verify insert was NOT called
      expect(mockClient._insertMock).not.toHaveBeenCalled()
    })
  })
})
