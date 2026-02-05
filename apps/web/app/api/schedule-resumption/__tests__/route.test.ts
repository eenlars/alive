/**
 * Tests for POST /api/schedule-resumption
 *
 * MCP tool API endpoint that enqueues a delayed conversation resumption via pg-boss.
 * Authenticated via session cookie (ALIVE_SESSION_COOKIE).
 *
 * Required tests:
 * - Authentication: requireSessionUser throws → 401
 * - Validation: invalid/missing payloads → 400
 * - Authorization: isWorkspaceAuthenticated false → 403
 * - Session lookup: sessionStore.get null → 404
 * - Enqueue failure: scheduleResumption returns null → 500
 * - Malformed JSON: non-JSON body → 400
 * - Happy path: all mocks succeed → 200 with scheduledAt, resumeAt, jobId
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ─── Mocks ───

const mockRequireSessionUser = vi.fn()
const mockIsWorkspaceAuthenticated = vi.fn()

vi.mock("@/features/auth/lib/auth", () => ({
  requireSessionUser: (...args: unknown[]) => mockRequireSessionUser(...args),
  isWorkspaceAuthenticated: (...args: unknown[]) => mockIsWorkspaceAuthenticated(...args),
  createErrorResponse: (error: string, status: number, fields?: Record<string, unknown>) => {
    return new Response(JSON.stringify({ ok: false, error, message: `Error: ${error}`, ...fields }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  },
}))

vi.mock("@/lib/error-codes", () => ({
  ErrorCodes: {
    UNAUTHORIZED: "UNAUTHORIZED",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    WORKSPACE_INVALID: "WORKSPACE_INVALID",
    FORBIDDEN: "FORBIDDEN",
    NO_SESSION: "NO_SESSION",
    INTERNAL_ERROR: "INTERNAL_ERROR",
  },
}))

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

const mockScheduleResumption = vi.fn()
vi.mock("@webalive/job-queue", () => ({
  scheduleResumption: (...args: unknown[]) => mockScheduleResumption(...args),
}))

// Import after mocks
const { POST } = await import("../route")

// ─── Helpers ───

const TEST_USER = { id: "user_abc", email: "test@test.com", name: "Test" }

function createRequest(body: unknown): Request {
  return new Request("http://localhost:9000/api/schedule-resumption", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function validBody(overrides?: Record<string, unknown>) {
  return {
    workspaceRoot: "/srv/webalive/sites/test.alive.best/user/src",
    delayMinutes: 5,
    reason: "Check back on build",
    resumeMessage: "How did the build go?",
    tabId: "tab-1",
    tabGroupId: "grp-1",
    ...overrides,
  }
}

// ─── Tests ───

describe("POST /api/schedule-resumption", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireSessionUser.mockResolvedValue(TEST_USER)
    mockIsWorkspaceAuthenticated.mockResolvedValue(true)
    mockSessionGet.mockResolvedValue("sdk-session-123")
    mockScheduleResumption.mockResolvedValue("pgboss-job-id-456")
  })

  // ─── Authentication ───

  describe("Authentication", () => {
    it("should return 401 when requireSessionUser throws", async () => {
      mockRequireSessionUser.mockRejectedValue(new Error("Unauthorized"))

      const req = createRequest(validBody())
      const res = await POST(req)

      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe("UNAUTHORIZED")
    })
  })

  // ─── Validation ───

  describe("Validation", () => {
    it("should return 400 for empty body", async () => {
      const req = createRequest({})
      const res = await POST(req)

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe("VALIDATION_ERROR")
    })

    it("should return 400 when delayMinutes is missing", async () => {
      const req = createRequest(validBody({ delayMinutes: undefined }))
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should return 400 when delayMinutes exceeds 1440", async () => {
      const req = createRequest(validBody({ delayMinutes: 1441 }))
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should return 400 when delayMinutes is 0", async () => {
      const req = createRequest(validBody({ delayMinutes: 0 }))
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should return 400 when reason is missing", async () => {
      const req = createRequest(validBody({ reason: undefined }))
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should return 400 when tabId is missing", async () => {
      const req = createRequest(validBody({ tabId: undefined }))
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should return 400 when tabGroupId is missing", async () => {
      const req = createRequest(validBody({ tabGroupId: undefined }))
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should return 400 when workspaceRoot is missing", async () => {
      const req = createRequest(validBody({ workspaceRoot: undefined }))
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should return 400 for malformed JSON body", async () => {
      const req = new Request("http://localhost:9000/api/schedule-resumption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe("VALIDATION_ERROR")
      expect(data.details).toBeDefined()
      expect(data.details[0].message).toBe("Malformed JSON body")
    })

    it("should return 400 when workspaceRoot has no /sites/ segment", async () => {
      const req = createRequest(validBody({ workspaceRoot: "/some/other/path" }))
      const res = await POST(req)

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe("WORKSPACE_INVALID")
    })
  })

  // ─── Authorization ───

  describe("Authorization", () => {
    it("should return 403 when workspace access denied", async () => {
      mockIsWorkspaceAuthenticated.mockResolvedValue(false)

      const req = createRequest(validBody())
      const res = await POST(req)

      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe("FORBIDDEN")
    })
  })

  // ─── Session Lookup ───

  describe("Session Lookup", () => {
    it("should return 404 when session does not exist", async () => {
      mockSessionGet.mockResolvedValue(null)

      const req = createRequest(validBody())
      const res = await POST(req)

      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe("NO_SESSION")
    })

    it("should look up session using computed tabKey", async () => {
      mockSessionGet.mockResolvedValue(null)

      const req = createRequest(validBody())
      await POST(req)

      expect(mockSessionGet).toHaveBeenCalledWith("user_abc::test.alive.best::grp-1::tab-1")
    })
  })

  // ─── Enqueue Failure ───

  describe("Enqueue Failure", () => {
    it("should return 500 when scheduleResumption returns null", async () => {
      mockScheduleResumption.mockResolvedValue(null)

      const req = createRequest(validBody())
      const res = await POST(req)

      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.ok).toBe(false)
      expect(data.error).toBe("ENQUEUE_FAILED")
    })
  })

  // ─── Happy Path ───

  describe("Happy Path", () => {
    it("should return 200 with scheduledAt, resumeAt, and jobId", async () => {
      const req = createRequest(validBody())
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.jobId).toBe("pgboss-job-id-456")
      expect(data.scheduledAt).toBeDefined()
      expect(data.resumeAt).toBeDefined()
      expect(data.message).toContain("5 minute")

      // resumeAt should be ~5 minutes after scheduledAt
      const scheduledAt = new Date(data.scheduledAt).getTime()
      const resumeAt = new Date(data.resumeAt).getTime()
      const diffMinutes = (resumeAt - scheduledAt) / 60000
      expect(diffMinutes).toBe(5)
    })

    it("should call scheduleResumption with correct payload and delay", async () => {
      const req = createRequest(validBody())
      await POST(req)

      expect(mockScheduleResumption).toHaveBeenCalledOnce()
      const [payload, delaySec] = mockScheduleResumption.mock.calls[0]

      expect(payload.userId).toBe("user_abc")
      expect(payload.workspace).toBe("test.alive.best")
      expect(payload.tabId).toBe("tab-1")
      expect(payload.tabGroupId).toBe("grp-1")
      expect(payload.message).toBe("How did the build go?")
      expect(payload.reason).toBe("Check back on build")
      expect(delaySec).toBe(300) // 5 min * 60
    })

    it("should use default message when resumeMessage is omitted", async () => {
      const req = createRequest(validBody({ resumeMessage: undefined }))
      await POST(req)

      const [payload] = mockScheduleResumption.mock.calls[0]
      expect(payload.message).toBe("Resuming conversation: Check back on build")
    })
  })
})
