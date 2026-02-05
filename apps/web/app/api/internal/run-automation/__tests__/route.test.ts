/**
 * Tests for POST /api/internal/run-automation
 *
 * Internal endpoint called by the pg-boss worker to execute automation jobs.
 * Uses X-Internal-Auth (shared secret) instead of session cookies.
 *
 * Required tests:
 * - Authentication: missing, wrong, empty secret rejected (401)
 * - Validation: missing required fields rejected (400)
 * - Happy path: valid request returns ok: true
 * - Error handling: executor failure returns error in response
 * - Timeout defaults: ?? vs || for timeoutSeconds
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ─── Mocks ───

// Mock the automation executor
const mockRunAutomationJob = vi.fn()
vi.mock("@/lib/automation/executor", () => ({
  runAutomationJob: (...args: unknown[]) => mockRunAutomationJob(...args),
}))

// Mock createErrorResponse to return proper NextResponse-like objects
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
    INTERNAL_ERROR: "INTERNAL_ERROR",
  },
}))

// Import the route handler after mocks are set up
const { POST } = await import("../route")

// ─── Helpers ───

const TEST_SECRET = "test-internal-secret-abc123"

function createRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost:9000/api/internal/run-automation", {
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
    jobId: "auto_job_test123",
    userId: "user_abc",
    orgId: "org_xyz",
    workspace: "test.alive.best",
    prompt: "Check the homepage and report any errors",
    timeoutSeconds: 120,
    ...overrides,
  }
}

// ─── Tests ───

describe("POST /api/internal/run-automation", () => {
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

    it("should reject when env secret is empty string", async () => {
      process.env.INTERNAL_TOOLS_SECRET = ""

      const req = createRequest(validBody(), {
        "X-Internal-Auth": "",
      })
      const res = await POST(req)
      // Both empty → would match, but !internalSecret check catches it
      expect(res.status).toBe(401)
    })
  })

  // ─── Input Validation ───

  describe("Input Validation", () => {
    it("should reject when all required fields are missing", async () => {
      const req = createRequest({}, { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.ok).toBe(false)
    })

    it("should reject when jobId is missing", async () => {
      const req = createRequest(validBody({ jobId: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when userId is missing", async () => {
      const req = createRequest(validBody({ userId: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when orgId is missing", async () => {
      const req = createRequest(validBody({ orgId: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when workspace is missing", async () => {
      const req = createRequest(validBody({ workspace: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when prompt is missing", async () => {
      const req = createRequest(validBody({ prompt: undefined }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it("should reject when prompt is empty string", async () => {
      const req = createRequest(validBody({ prompt: "" }), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })
  })

  // ─── Happy Path ───

  describe("Happy Path", () => {
    it("should call runAutomationJob with correct params", async () => {
      mockRunAutomationJob.mockResolvedValue({
        success: true,
        durationMs: 5000,
        response: "All good",
      })

      const body = validBody()
      const req = createRequest(body, { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.durationMs).toBe(5000)

      // Verify executor was called with correct params
      expect(mockRunAutomationJob).toHaveBeenCalledOnce()
      expect(mockRunAutomationJob).toHaveBeenCalledWith({
        jobId: body.jobId,
        userId: body.userId,
        orgId: body.orgId,
        workspace: body.workspace,
        prompt: body.prompt,
        timeoutSeconds: 120,
        model: undefined,
        thinkingPrompt: undefined,
        skills: undefined,
      })
    })

    it("should pass optional model and thinkingPrompt", async () => {
      mockRunAutomationJob.mockResolvedValue({
        success: true,
        durationMs: 3000,
      })

      const body = validBody({
        model: "claude-sonnet-4-20250514",
        thinkingPrompt: "Focus on errors",
        skills: ["seo-audit"],
      })
      const req = createRequest(body, { "X-Internal-Auth": TEST_SECRET })
      await POST(req)

      expect(mockRunAutomationJob).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-20250514",
          thinkingPrompt: "Focus on errors",
          skills: ["seo-audit"],
        }),
      )
    })

    it("should truncate response to 5000 chars", async () => {
      const longResponse = "A".repeat(10000)
      mockRunAutomationJob.mockResolvedValue({
        success: true,
        durationMs: 1000,
        response: longResponse,
      })

      const req = createRequest(validBody(), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      const data = await res.json()

      expect(data.response.length).toBe(5000)
    })
  })

  // ─── Timeout Defaults ───

  describe("Timeout Defaults", () => {
    it("should default timeoutSeconds to 300 when undefined", async () => {
      mockRunAutomationJob.mockResolvedValue({ success: true, durationMs: 100 })

      const body = validBody({ timeoutSeconds: undefined })
      const req = createRequest(body, { "X-Internal-Auth": TEST_SECRET })
      await POST(req)

      expect(mockRunAutomationJob).toHaveBeenCalledWith(expect.objectContaining({ timeoutSeconds: 300 }))
    })

    it("should default timeoutSeconds to 300 when null", async () => {
      mockRunAutomationJob.mockResolvedValue({ success: true, durationMs: 100 })

      const body = validBody({ timeoutSeconds: null })
      const req = createRequest(body, { "X-Internal-Auth": TEST_SECRET })
      await POST(req)

      expect(mockRunAutomationJob).toHaveBeenCalledWith(expect.objectContaining({ timeoutSeconds: 300 }))
    })

    it("should preserve timeoutSeconds=0 (not coerce to 300)", async () => {
      mockRunAutomationJob.mockResolvedValue({ success: true, durationMs: 100 })

      const body = validBody({ timeoutSeconds: 0 })
      const req = createRequest(body, { "X-Internal-Auth": TEST_SECRET })
      await POST(req)

      // This is the ?? vs || bug test — 0 is a valid value
      expect(mockRunAutomationJob).toHaveBeenCalledWith(expect.objectContaining({ timeoutSeconds: 0 }))
    })
  })

  // ─── Error Handling ───

  describe("Error Handling", () => {
    it("should return ok:false when executor reports failure", async () => {
      mockRunAutomationJob.mockResolvedValue({
        success: false,
        durationMs: 2000,
        error: "Workspace not found",
      })

      const req = createRequest(validBody(), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("Workspace not found")
    })

    it("should return 500 when executor throws", async () => {
      mockRunAutomationJob.mockRejectedValue(new Error("Unexpected crash"))

      const req = createRequest(validBody(), { "X-Internal-Auth": TEST_SECRET })
      const res = await POST(req)

      expect(res.status).toBe(500)
    })

    it("should return 500 when body is invalid JSON", async () => {
      const req = new Request("http://localhost:9000/api/internal/run-automation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Auth": TEST_SECRET,
        },
        body: "not json at all",
      })

      const res = await POST(req)
      expect(res.status).toBe(500)
    })
  })
})
