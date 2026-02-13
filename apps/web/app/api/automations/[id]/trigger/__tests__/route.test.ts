import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const getSessionUserMock = vi.fn()
const getAutomationExecutionGateMock = vi.fn()
const createServiceAppClientMock = vi.fn()
const claimJobMock = vi.fn()
const executeJobMock = vi.fn()
const finishJobMock = vi.fn()

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
  claimJob: (...args: unknown[]) => claimJobMock(...args),
  executeJob: (...args: unknown[]) => executeJobMock(...args),
  extractSummary: vi.fn(),
  finishJob: (...args: unknown[]) => finishJobMock(...args),
}))

vi.mock("@webalive/shared", async importOriginal => {
  const actual = await importOriginal<typeof import("@webalive/shared")>()
  return {
    ...actual,
    getServerId: vi.fn(() => "srv_test"),
  }
})

vi.mock("@/lib/automation/validation", () => ({
  validateActionPrompt: vi.fn(() => ({ valid: true })),
  validateWorkspace: vi.fn(() => Promise.resolve({ valid: true })),
}))

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
    executeJobMock.mockResolvedValue({
      success: true,
      response: "done",
      error: null,
      durationMs: 42,
      messages: [],
      costUsd: 0,
      numTurns: 1,
      usage: undefined,
    })
    finishJobMock.mockResolvedValue(undefined)
  })

  it("returns 401 without a valid session", async () => {
    getSessionUserMock.mockResolvedValueOnce(null)

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "job_1" }) })

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toBe(ErrorCodes.UNAUTHORIZED)
  })

  it("returns 202 with queued status on successful trigger", async () => {
    getSessionUserMock.mockResolvedValueOnce({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
    })

    const mockJob = {
      id: "job_1",
      name: "test-job",
      user_id: "user_1",
      running_at: null,
      action_timeout_seconds: 300,
      action_type: "prompt",
      action_prompt: "Do something",
      domains: { hostname: "test.example.com", server_id: "srv_test" },
    }

    createServiceAppClientMock.mockReturnValueOnce({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: mockJob, error: null }),
          }),
        }),
      }),
    })

    claimJobMock.mockResolvedValueOnce({
      supabase: {},
      job: mockJob,
      hostname: "test.example.com",
      runId: "run_abc",
      claimedAt: "2026-01-01T00:00:00Z",
      serverId: "srv_test",
      timeoutSeconds: 300,
      triggeredBy: "manual",
      heartbeatInterval: null,
    })

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "job_1" }) })

    expect(response.status).toBe(202)
    const payload = await response.json()
    expect(payload.ok).toBe(true)
    expect(payload.status).toBe("queued")
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
