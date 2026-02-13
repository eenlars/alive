import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const getSessionUserMock = vi.fn()
const createServiceAppClientMock = vi.fn()
const pokeCronServiceMock = vi.fn()

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: () => getSessionUserMock(),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceAppClient: () => createServiceAppClientMock(),
}))

vi.mock("@/lib/automation/cron-service", () => ({
  pokeCronService: () => pokeCronServiceMock(),
}))

vi.mock("@/lib/api/responses", () => ({
  structuredErrorResponse: vi.fn(
    (code: string, opts: { status: number; details?: Record<string, unknown> }) =>
      new Response(JSON.stringify({ ok: false, error: code, ...opts.details }), { status: opts.status }),
  ),
}))

vi.mock("@/lib/automation/validation", () => ({
  validateCronSchedule: vi.fn(() => ({ valid: true, nextRuns: [] })),
  validateTimezone: vi.fn(() => ({ valid: true })),
  validateTimeout: vi.fn(() => ({ valid: true })),
  validateActionPrompt: vi.fn(() => ({ valid: true })),
  formatNextRuns: vi.fn(() => "next-runs"),
}))

vi.mock("@webalive/automation", () => ({
  computeNextRunAtMs: vi.fn(() => Date.now() + 60_000),
}))

const { PATCH } = await import("../route")

type OwnershipRow = {
  user_id: string
  cron_schedule: string | null
  cron_timezone: string | null
  action_type: string | null
  running_at: string | null
}

function makePatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/automations/job_1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeSupabaseClient(existing: OwnershipRow, updated?: Record<string, unknown>) {
  const updateMock = vi.fn((updates: Record<string, unknown>) => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: {
              id: "job_1",
              trigger_type: "one-time",
              cron_schedule: null,
              cron_timezone: null,
              ...updated,
              ...updates,
            },
            error: null,
          }),
        ),
      })),
    })),
  }))

  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: existing, error: null })),
        })),
      })),
      update: updateMock,
    })),
  }

  return { client, updateMock }
}

describe("PATCH /api/automations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSessionUserMock.mockResolvedValue({
      id: "user_1",
      email: "owner@example.com",
      name: "Owner",
    })
  })

  it("returns 401 when user is not authenticated", async () => {
    getSessionUserMock.mockResolvedValueOnce(null)

    const response = await PATCH(makePatchRequest({ is_active: false }), {
      params: Promise.resolve({ id: "job_1" }),
    })

    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.error).toBe(ErrorCodes.UNAUTHORIZED)
  })

  it("returns 409 when toggling is_active while job is already running", async () => {
    const { client, updateMock } = makeSupabaseClient({
      user_id: "user_1",
      cron_schedule: null,
      cron_timezone: null,
      action_type: "prompt",
      running_at: "2026-02-12T10:00:00.000Z",
    })
    createServiceAppClientMock.mockReturnValueOnce(client)

    const response = await PATCH(makePatchRequest({ is_active: false }), {
      params: Promise.resolve({ id: "job_1" }),
    })

    expect(response.status).toBe(409)
    const payload = await response.json()
    expect(payload.error).toBe(ErrorCodes.AUTOMATION_ALREADY_RUNNING)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("syncs status=disabled when is_active is set to false", async () => {
    const { client, updateMock } = makeSupabaseClient({
      user_id: "user_1",
      cron_schedule: null,
      cron_timezone: null,
      action_type: "prompt",
      running_at: null,
    })
    createServiceAppClientMock.mockReturnValueOnce(client)

    const response = await PATCH(makePatchRequest({ is_active: false }), {
      params: Promise.resolve({ id: "job_1" }),
    })

    expect(response.status).toBe(200)
    expect(updateMock).toHaveBeenCalledTimes(1)
    const updatePayload = updateMock.mock.calls[0]?.[0]
    expect(updatePayload?.is_active).toBe(false)
    expect(updatePayload?.status).toBe("disabled")
    expect(pokeCronServiceMock).toHaveBeenCalledTimes(1)
  })
})
