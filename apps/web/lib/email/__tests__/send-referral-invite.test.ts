import { afterEach, describe, expect, it, vi } from "vitest"
import { sendReferralInvite } from "../send-referral-invite"

/**
 * Send Referral Invite Tests
 *
 * Tests the Loops.so email integration for referral invites.
 * Uses mocked fetch to avoid hitting real API.
 */

describe("sendReferralInvite", () => {
  const originalLoopsKey = process.env.LOOPS_API_KEY

  afterEach(() => {
    process.env.LOOPS_API_KEY = originalLoopsKey
    vi.restoreAllMocks()
  })

  describe("API Key Validation", () => {
    it("should throw if LOOPS_API_KEY is not set", async () => {
      delete process.env.LOOPS_API_KEY

      await expect(
        sendReferralInvite({
          to: "test@example.com",
          senderName: "John",
          inviteLink: "https://alive.best/invite/ABC123",
        }),
      ).rejects.toThrow("LOOPS_API_KEY not configured")
    })

    it("should throw if LOOPS_API_KEY is empty string", async () => {
      process.env.LOOPS_API_KEY = ""

      await expect(
        sendReferralInvite({
          to: "test@example.com",
          senderName: "John",
          inviteLink: "https://alive.best/invite/ABC123",
        }),
      ).rejects.toThrow("LOOPS_API_KEY not configured")
    })
  })

  describe("Successful Requests", () => {
    it("should send request to Loops API with correct payload", async () => {
      process.env.LOOPS_API_KEY = "test_api_key_123"

      const mockResponse = { success: true, id: "msg_123" }
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const result = await sendReferralInvite({
        to: "recipient@example.com",
        senderName: "Alice",
        inviteLink: "https://alive.best/invite/XYZ789",
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://app.loops.so/api/v1/transactional",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test_api_key_123",
            "Content-Type": "application/json",
          },
        }),
      )

      // Verify body content
      const callArgs = fetchSpy.mock.calls[0]
      const body = JSON.parse(callArgs[1]?.body as string)
      expect(body).toEqual({
        transactionalId: expect.any(String),
        email: "recipient@example.com",
        dataVariables: {
          senderName: "Alice",
          inviteLink: "https://alive.best/invite/XYZ789",
        },
      })

      expect(result).toEqual(mockResponse)
    })

    it("should return Loops response on success", async () => {
      process.env.LOOPS_API_KEY = "test_key"

      const mockResponse = { success: true, id: "email_abc123" }
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const result = await sendReferralInvite({
        to: "test@test.com",
        senderName: "Test",
        inviteLink: "https://example.com/invite/123",
      })

      expect(result).toEqual(mockResponse)
    })
  })

  describe("Error Handling", () => {
    it("should throw on non-ok response with status and message", async () => {
      process.env.LOOPS_API_KEY = "test_key"

      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Invalid email format"),
      } as Response)

      await expect(
        sendReferralInvite({
          to: "bad-email",
          senderName: "Test",
          inviteLink: "https://example.com/invite/123",
        }),
      ).rejects.toThrow("Loops API error: 400 - Invalid email format")
    })

    it("should throw on 401 unauthorized", async () => {
      process.env.LOOPS_API_KEY = "invalid_key"

      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Invalid API key"),
      } as Response)

      await expect(
        sendReferralInvite({
          to: "test@example.com",
          senderName: "Test",
          inviteLink: "https://example.com/invite/123",
        }),
      ).rejects.toThrow("Loops API error: 401 - Invalid API key")
    })

    it("should throw on 500 server error", async () => {
      process.env.LOOPS_API_KEY = "test_key"

      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal server error"),
      } as Response)

      await expect(
        sendReferralInvite({
          to: "test@example.com",
          senderName: "Test",
          inviteLink: "https://example.com/invite/123",
        }),
      ).rejects.toThrow("Loops API error: 500 - Internal server error")
    })

    it("should throw on network failure", async () => {
      process.env.LOOPS_API_KEY = "test_key"

      vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"))

      await expect(
        sendReferralInvite({
          to: "test@example.com",
          senderName: "Test",
          inviteLink: "https://example.com/invite/123",
        }),
      ).rejects.toThrow("Network error")
    })
  })

  describe("Request Format", () => {
    it("should use correct Loops API endpoint", async () => {
      process.env.LOOPS_API_KEY = "test_key"

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)

      await sendReferralInvite({
        to: "test@example.com",
        senderName: "Test",
        inviteLink: "https://example.com/invite/123",
      })

      expect(fetchSpy).toHaveBeenCalledWith("https://app.loops.so/api/v1/transactional", expect.any(Object))
    })

    it("should include Authorization header with Bearer token", async () => {
      process.env.LOOPS_API_KEY = "my_secret_key"

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)

      await sendReferralInvite({
        to: "test@example.com",
        senderName: "Test",
        inviteLink: "https://example.com/invite/123",
      })

      const callArgs = fetchSpy.mock.calls[0]
      const headers = callArgs[1]?.headers as Record<string, string>
      expect(headers.Authorization).toBe("Bearer my_secret_key")
    })

    it("should set Content-Type to application/json", async () => {
      process.env.LOOPS_API_KEY = "test_key"

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)

      await sendReferralInvite({
        to: "test@example.com",
        senderName: "Test",
        inviteLink: "https://example.com/invite/123",
      })

      const callArgs = fetchSpy.mock.calls[0]
      const headers = callArgs[1]?.headers as Record<string, string>
      expect(headers["Content-Type"]).toBe("application/json")
    })
  })

  describe("Edge Cases", () => {
    it("should handle special characters in senderName", async () => {
      process.env.LOOPS_API_KEY = "test_key"

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)

      await sendReferralInvite({
        to: "test@example.com",
        senderName: "José García-López",
        inviteLink: "https://example.com/invite/123",
      })

      const callArgs = fetchSpy.mock.calls[0]
      const body = JSON.parse(callArgs[1]?.body as string)
      expect(body.dataVariables.senderName).toBe("José García-López")
    })

    it("should handle empty senderName", async () => {
      process.env.LOOPS_API_KEY = "test_key"

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)

      await sendReferralInvite({
        to: "test@example.com",
        senderName: "",
        inviteLink: "https://example.com/invite/123",
      })

      const callArgs = fetchSpy.mock.calls[0]
      const body = JSON.parse(callArgs[1]?.body as string)
      expect(body.dataVariables.senderName).toBe("")
    })

    it("should handle long invite links", async () => {
      process.env.LOOPS_API_KEY = "test_key"

      const longLink = `https://alive.best/invite/${"A".repeat(1000)}`

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)

      await sendReferralInvite({
        to: "test@example.com",
        senderName: "Test",
        inviteLink: longLink,
      })

      const callArgs = fetchSpy.mock.calls[0]
      const body = JSON.parse(callArgs[1]?.body as string)
      expect(body.dataVariables.inviteLink).toBe(longLink)
    })
  })
})
