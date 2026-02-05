/**
 * Tests for POST /api/internal/resume-conversation
 *
 * Internal endpoint called by the pg-boss worker to inject a message
 * into an existing Claude conversation session.
 * Uses X-Internal-Auth (shared secret) instead of session cookies.
 *
 * Required tests:
 * - Authentication: missing, wrong, empty secret rejected (401)
 * - Validation: missing required fields rejected (400)
 * - Session lookup: non-existent session returns 404
 * - Happy path: valid request resumes session
 * - Security: sessionKey computed from components, not trusted from body
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ─── Mocks ───

// Mock sessionStore
const mockSessionGet = vi.fn()
vi.mock("@/features/auth/lib/sessionStore", () => ({
  sessionStore: {
    get: (...args: unknown[]) => mockSessionGet(...args),
  },
  tabKey: ({
    userId,
    workspace,
    tabGroupId,
    tabId,
  }: {
    userId: string
    workspace: string
    tabGroupId: string
    tabId: string
  }) => `${userId}::${workspace}::${tabGroupId}::${tabId}`,
}))

// Mock createErrorResponse
vi.mock("@/features/auth/lib/auth", () => ({
  createErrorResponse: (error: string, status: number, fields?: Record<string, unknown>) => {
    return new Response(
      JSON.stringify({
        ok: false,
        error,
        message: `Error: ${error}`,
        ...fields,
      }),
      { status, headers: { "Content-Type": "application/json" } },
    )
  },
}))

// Mock ErrorCodes
vi.mock("@/lib/error-codes", () => ({
  ErrorCodes: {
    UNAUTHORIZED: "UNAUTHORIZED",
    INVALID_REQUEST: "INVALID_REQUEST",
    NO_SESSION: "NO_SESSION",
    STREAM_ERROR: "STREAM_ERROR",
    INTERNAL_ERROR: "INTERNAL_ERROR",
  },
}))

// Mock global fetch for internal stream call
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Import after mocks
const { POST } = await import("../route")

// ─── Helpers ───

const TEST_SECRET = "test-internal-secret-xyz789"

function createRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost:9000/api/internal/resume-conversation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function validBody(overrides?: Record<string, unknown>) {
  return {
    userId: "user_abc",
    workspace: "test.alive.best",
    tabId: "tab-1",
    tabGroupId: "grp-1",
    message: "Continue working on the homepage",
    reason: "scheduled-check",
    ...overrides,
  }
}

// Create a mock ReadableStream that completes immediately
function createMockStream() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: {}\n\n"))
      controller.close()
    },
  })
}

// ─── Tests ───

describe("POST /api/internal/resume-conversation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_TOOLS_SECRET = TEST_SECRET
  })

  // ─── Authentication ───

  describe("Authentication", () => {
    it("should reject requests without X-Internal-Auth header", async () => {
      const req = createRequest(validBody())
      const res = await POST(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toBe("UNAUTHORIZED")
    })

    it("should reject requests with wrong secret", async () => {
      const req = createRequest(validBody(), {
        "X-Internal-Auth": "wrong-secret",
      })
      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it("should reject requests with empty secret", async () => {
      const req = createRequest(validBody(), {
        "X-Internal-Auth": "",
      })
      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it("should reject when INTERNAL_TOOLS_SECRET env is not set", async () => {
      delete process.env.INTERNAL_TOOLS_SECRET

      const req = createRequest(validBody(), {
        "X-Internal-Auth": TEST_SECRET,
      })
      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it("should reject when both env and header are empty", async () => {
      process.env.INTERNAL_TOOLS_SECRET = ""

      const req = createRequest(validBody(), {
        "X-Internal-Auth": "",
      })
      const res = await POST(req)
      expect(res.status).toBe(401)
    })
  })

  // ─── Input Validation ───

  describe("Input Validation", () => {
    it("should reject when all required fields are missing", async () => {
      const req = createRequest({}, { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when userId is missing", async () => {
      const req = createRequest(validBody({ userId: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when workspace is missing", async () => {
      const req = createRequest(validBody({ workspace: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when tabId is missing", async () => {
      const req = createRequest(validBody({ tabId: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when tabGroupId is missing", async () => {
      const req = createRequest(validBody({ tabGroupId: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when message is missing", async () => {
      const req = createRequest(validBody({ message: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when message is empty string", async () => {
      const req = createRequest(validBody({ message: "" }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })
  })

  // ─── Session Lookup ───

  describe("Session Lookup", () => {
    it("should return 404 when session does not exist", async () => {
      mockSessionGet.mockResolvedValue(null)

      const req = createRequest(validBody(), {
        "X-Internal-Auth": TEST_SECRET,
      })
      const res = await POST(req)

      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe("NO_SESSION")
    })

    it("should compute sessionKey from components using tabKey()", async () => {
      mockSessionGet.mockResolvedValue(null)

      const body = validBody({
        userId: "user_123",
        workspace: "my.site.com",
        tabGroupId: "grp-A",
        tabId: "tab-B",
      })
      const req = createRequest(body, { "X-Internal-Auth": TEST_SECRET })
      await POST(req)

      // tabKey should be called with the components, producing the composite key
      expect(mockSessionGet).toHaveBeenCalledWith("user_123::my.site.com::grp-A::tab-B")
    })

    it("should NOT trust raw sessionKey from body (uses tabKey instead)", async () => {
      mockSessionGet.mockResolvedValue(null)

      // Even if body includes a sessionKey field, it should be ignored
      const body = {
        ...validBody(),
        sessionKey: "attacker-controlled-key",
      }
      const req = createRequest(body, { "X-Internal-Auth": TEST_SECRET })
      await POST(req)

      // Should use computed key, not the attacker-supplied one
      expect(mockSessionGet).not.toHaveBeenCalledWith("attacker-controlled-key")
      expect(mockSessionGet).toHaveBeenCalledWith(expect.stringContaining("user_abc::test.alive.best::grp-1::tab-1"))
    })
  })

  // ─── Happy Path ───

  describe("Happy Path", () => {
    it("should resume session when everything is valid", async () => {
      mockSessionGet.mockResolvedValue("sdk-session-id-123")
      mockFetch.mockResolvedValue(new Response(createMockStream(), { status: 200 }))

      const req = createRequest(validBody(), {
        "X-Internal-Auth": TEST_SECRET,
      })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
    })

    it("should forward message with reason prefix to stream endpoint", async () => {
      mockSessionGet.mockResolvedValue("sdk-session-id-123")
      mockFetch.mockResolvedValue(new Response(createMockStream(), { status: 200 }))

      const body = validBody({
        message: "Check for errors",
        reason: "daily-review",
      })
      const req = createRequest(body, { "X-Internal-Auth": TEST_SECRET })
      await POST(req)

      // Verify fetch was called with the right payload
      expect(mockFetch).toHaveBeenCalledOnce()
      const fetchCall = mockFetch.mock.calls[0]
      const fetchBody = JSON.parse(fetchCall[1].body)

      // Message should include reason prefix
      expect(fetchBody.message).toContain("[Scheduled resumption: daily-review]")
      expect(fetchBody.message).toContain("Check for errors")
      expect(fetchBody.workspace).toBe("test.alive.best")
      expect(fetchBody.tabId).toBe("tab-1")
      expect(fetchBody.tabGroupId).toBe("grp-1")
      expect(fetchBody.isScheduledResumption).toBe(true)
    })

    it("should pass X-Internal-Auth and X-Internal-User-Id headers to stream", async () => {
      mockSessionGet.mockResolvedValue("sdk-session-id-123")
      mockFetch.mockResolvedValue(new Response(createMockStream(), { status: 200 }))

      const req = createRequest(validBody(), {
        "X-Internal-Auth": TEST_SECRET,
      })
      await POST(req)

      const fetchCall = mockFetch.mock.calls[0]
      const fetchHeaders = fetchCall[1].headers

      expect(fetchHeaders["X-Internal-Auth"]).toBe(TEST_SECRET)
      expect(fetchHeaders["X-Internal-User-Id"]).toBe("user_abc")
    })
  })

  // ─── Stream Failures ───

  describe("Stream Failures", () => {
    it("should return STREAM_ERROR when stream endpoint fails", async () => {
      mockSessionGet.mockResolvedValue("sdk-session-id-123")
      mockFetch.mockResolvedValue(new Response("Internal Server Error", { status: 500 }))

      const req = createRequest(validBody(), {
        "X-Internal-Auth": TEST_SECRET,
      })
      const res = await POST(req)

      expect(res.status).toBe(500)
    })

    it("should return 500 when fetch throws (network error)", async () => {
      mockSessionGet.mockResolvedValue("sdk-session-id-123")
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"))

      const req = createRequest(validBody(), {
        "X-Internal-Auth": TEST_SECRET,
      })
      const res = await POST(req)

      expect(res.status).toBe(500)
    })
  })

  // ─── Edge Cases ───

  describe("Edge Cases", () => {
    it("should handle invalid JSON body gracefully", async () => {
      const req = new Request("http://localhost:9000/api/internal/resume-conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Auth": TEST_SECRET,
        },
        body: "not valid json",
      })

      const res = await POST(req)
      expect(res.status).toBe(500)
    })

    it("should use PORT env var for stream URL", async () => {
      process.env.PORT = "8998"
      mockSessionGet.mockResolvedValue("sdk-session-id-123")
      mockFetch.mockResolvedValue(new Response(createMockStream(), { status: 200 }))

      const req = createRequest(validBody(), {
        "X-Internal-Auth": TEST_SECRET,
      })
      await POST(req)

      const fetchCall = mockFetch.mock.calls[0]
      expect(fetchCall[0]).toContain("localhost:8998")

      // Clean up
      delete process.env.PORT
    })
  })
})
