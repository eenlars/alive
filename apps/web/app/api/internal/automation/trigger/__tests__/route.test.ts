import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const structuredErrorResponseMock = vi.fn()
const getAutomationExecutionGateMock = vi.fn()
const createServiceAppClientMock = vi.fn()
const claimJobMock = vi.fn()
const extractSummaryMock = vi.fn()
const finishJobMock = vi.fn()
const executeJobMock = vi.fn()

vi.mock("@/features/auth/lib/auth", () => ({}))

vi.mock("@/lib/api/responses", () => ({
  structuredErrorResponse: (code: string, opts: { status: number; details?: Record<string, unknown> }) =>
    structuredErrorResponseMock(code, opts),
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

vi.mock("@webalive/automation-engine", () => ({
  claimJob: (...args: unknown[]) => claimJobMock(...args),
  extractSummary: (...args: unknown[]) => extractSummaryMock(...args),
  finishJob: (...args: unknown[]) => finishJobMock(...args),
}))

vi.mock("@/lib/automation/execute", () => ({
  executeJob: (...args: unknown[]) => executeJobMock(...args),
}))

vi.mock("@/app/api/automations/events/route", () => ({
  broadcastAutomationEvent: vi.fn(),
}))

vi.mock("@/lib/automation/notifications", () => ({
  notifyJobDisabled: vi.fn(),
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
    extractSummaryMock.mockReturnValue("Done")
    finishJobMock.mockResolvedValue(undefined)
    executeJobMock.mockResolvedValue({
      success: true,
      durationMs: 30,
      response: "Done",
      messages: [],
      costUsd: 0.02,
      numTurns: 1,
      usage: { input_tokens: 12, output_tokens: 24 },
    })
    structuredErrorResponseMock.mockImplementation(
      (code: string, opts: { status: number; details?: Record<string, unknown> }) =>
        new Response(JSON.stringify({ ok: false, error: code, ...opts.details }), { status: opts.status }),
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

  it("returns success and wires lifecycle hooks on valid internal trigger", async () => {
    const mockJob = {
      id: "job_1",
      name: "test-job",
      user_id: "user_1",
      org_id: "org_1",
      site_id: "site_1",
      is_active: true,
      running_at: null,
      action_type: "prompt",
      action_prompt: "Do something",
      action_timeout_seconds: 300,
      trigger_type: "cron",
      cron_schedule: "0 * * * *",
      cron_timezone: null,
      consecutive_failures: 0,
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

    const ctx = {
      supabase: {},
      job: mockJob,
      hostname: "test.example.com",
      runId: "run_abc",
      claimedAt: "2026-01-01T00:00:00Z",
      serverId: "srv_test",
      timeoutSeconds: 300,
      triggeredBy: "internal",
      heartbeatInterval: null,
    }

    claimJobMock.mockResolvedValueOnce(ctx)

    const response = await POST(makeRequest("internal-secret"))

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.ok).toBe(true)
    expect(finishJobMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        status: "success",
        durationMs: 30,
        summary: "Done",
        hooks: expect.objectContaining({
          onJobDisabled: expect.any(Function),
          onJobFinished: expect.any(Function),
        }),
      }),
    )
  })
})
