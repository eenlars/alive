import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const getSessionUserMock = vi.fn()
const getAutomationExecutionGateMock = vi.fn()
const createServiceAppClientMock = vi.fn()

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: () => getSessionUserMock(),
}))

vi.mock("@/lib/automation/execution-guard", () => ({
  getAutomationExecutionGate: () => getAutomationExecutionGateMock(),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceAppClient: () => createServiceAppClientMock(),
}))

vi.mock("@/lib/api/responses", async importOriginal => {
  return await importOriginal<typeof import("@/lib/api/responses")>()
})

vi.mock("@/lib/automation/cron-service", () => ({
  pokeCronService: vi.fn(),
}))

vi.mock("@/lib/automation/engine", () => ({
  claimJob: vi.fn(),
  executeJob: vi.fn(),
  extractSummary: vi.fn(),
  finishJob: vi.fn(),
}))

vi.mock("@webalive/shared", async importOriginal => {
  const actual = await importOriginal<typeof import("@webalive/shared")>()
  return {
    ...actual,
    getServerId: vi.fn(() => "srv_test"),
  }
})

const { POST } = await import("../route")

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/automations/job_1/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/automations/[id]/trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAutomationExecutionGateMock.mockReturnValue({ allowed: true, reason: "ok" })
    createServiceAppClientMock.mockReturnValue({})
  })

  it("returns 401 without a valid session", async () => {
    getSessionUserMock.mockResolvedValueOnce(null)

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "job_1" }) })

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toBe(ErrorCodes.UNAUTHORIZED)
  })

  it("returns 403 when automation execution is disabled on this environment/server", async () => {
    getSessionUserMock.mockResolvedValueOnce({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
    })
    getAutomationExecutionGateMock.mockReturnValueOnce({
      allowed: false,
      reason: "Automations are disabled on this server",
    })

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "job_1" }) })

    expect(response.status).toBe(403)
    const payload = await response.json()
    expect(payload.error).toBe(ErrorCodes.FORBIDDEN)
    expect(createServiceAppClientMock).not.toHaveBeenCalled()
  })
})
