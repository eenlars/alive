import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const createErrorResponseMock = vi.fn()
const getAutomationExecutionGateMock = vi.fn()
const createServiceAppClientMock = vi.fn()

vi.mock("@/features/auth/lib/auth", () => ({
  createErrorResponse: (code: string, status: number, fields?: Record<string, unknown>) =>
    createErrorResponseMock(code, status, fields),
}))

vi.mock("@/lib/automation/execution-guard", () => ({
  getAutomationExecutionGate: () => getAutomationExecutionGateMock(),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceAppClient: () => createServiceAppClientMock(),
}))

vi.mock("@/lib/automation/cron-service", () => ({
  pokeCronService: vi.fn(),
}))

vi.mock("@/lib/automation/engine", () => ({
  claimJob: vi.fn(),
  executeJob: vi.fn(),
  extractSummary: vi.fn(),
  finishJob: vi.fn(),
}))

const { POST } = await import("../route")

function makeRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (secret) {
    headers["X-Internal-Secret"] = secret
  }
  return new NextRequest("http://localhost/api/internal/automation/trigger", {
    method: "POST",
    headers,
    body: JSON.stringify({ jobId: "job_1" }),
  })
}

describe("POST /api/internal/automation/trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.JWT_SECRET = "internal-secret"
    getAutomationExecutionGateMock.mockReturnValue({ allowed: true, reason: "ok" })
    createServiceAppClientMock.mockReturnValue({})
    createErrorResponseMock.mockImplementation(
      (code: string, status: number, fields?: Record<string, unknown>) =>
        new Response(JSON.stringify({ ok: false, error: code, ...fields }), { status }),
    )
  })

  afterEach(() => {
    delete process.env.JWT_SECRET
  })

  it("returns 401 for invalid internal secret", async () => {
    const response = await POST(makeRequest("wrong-secret"))

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toBe(ErrorCodes.UNAUTHORIZED)
  })

  it("returns 403 when automation execution is disabled on this environment/server", async () => {
    getAutomationExecutionGateMock.mockReturnValueOnce({
      allowed: false,
      reason: "Automations are disabled on this server",
    })

    const response = await POST(makeRequest("internal-secret"))

    expect(response.status).toBe(403)
    const payload = await response.json()
    expect(payload.error).toBe(ErrorCodes.FORBIDDEN)
    expect(createServiceAppClientMock).not.toHaveBeenCalled()
  })
})
