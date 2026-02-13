import { beforeEach, describe, expect, it, vi } from "vitest"

// =============================================================================
// Mocks
// =============================================================================

const mkdirMock = vi.fn()
const writeFileMock = vi.fn()
const renameMock = vi.fn()
const rmMock = vi.fn()

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: mkdirMock,
    writeFile: writeFileMock,
    rename: renameMock,
    rm: rmMock,
    readFile: vi.fn(),
    realpath: vi.fn(),
  },
}))

vi.mock("@webalive/shared", () => ({
  getServerId: vi.fn(() => "srv_test"),
}))

const computeNextRunAtMsMock = vi.fn(() => Date.now() + 3_600_000)
vi.mock("@webalive/automation", () => ({
  computeNextRunAtMs: computeNextRunAtMsMock,
}))

// =============================================================================
// Helpers
// =============================================================================

interface MockCtxOpts {
  triggerType?: "cron" | "one-time" | "webhook" | "email"
  cronSchedule?: string | null
  consecutiveFailures?: number
}

function mockSupabase() {
  const updateData: Record<string, unknown>[] = []
  const insertData: Record<string, unknown>[] = []

  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    // biome-ignore lint/suspicious/noThenProperty: mock must be thenable for Supabase await pattern
    then: undefined as unknown,
  }
  // Capture update payload
  const updateFn = vi.fn((data: Record<string, unknown>) => {
    updateData.push(data)
    // Return { count: 1 } for conditional update success
    updateChain.eq = vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ count: 1, error: null })),
    }))
    return updateChain
  })

  const insertFn = vi.fn((data: Record<string, unknown>) => {
    insertData.push(data)
    return Promise.resolve({ error: null })
  })

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "automation_jobs") return { update: updateFn }
      if (table === "automation_runs") return { insert: insertFn }
      return {}
    }),
  }

  return { supabase, updateData, insertData }
}

function makeRunContext(opts: MockCtxOpts = {}) {
  const { supabase, updateData, insertData } = mockSupabase()

  const ctx = {
    supabase,
    job: {
      id: "job_test",
      name: "test-job",
      site_id: "site_1",
      user_id: "user_1",
      org_id: "org_1",
      is_active: true,
      status: "running" as const,
      trigger_type: opts.triggerType ?? "cron",
      action_type: "prompt" as const,
      action_prompt: "do stuff",
      action_timeout_seconds: 300,
      cron_schedule: opts.cronSchedule !== undefined ? opts.cronSchedule : "0 * * * *",
      cron_timezone: null,
      consecutive_failures: opts.consecutiveFailures ?? 0,
      running_at: new Date().toISOString(),
      run_at: null,
      next_run_at: null,
      last_run_at: null,
      last_run_status: null,
      last_run_error: null,
      last_run_duration_ms: null,
      delete_after_run: false,
      skills: null,
      webhook_secret: null,
      email_address: null,
      description: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      run_id: "run_abc",
      claimed_by: "srv_test",
      lease_expires_at: null,
      action_model: null,
      action_thinking: null,
      action_source: null,
      action_target_page: null,
      action_format_prompt: null,
    },
    hostname: "test.alive.best",
    runId: "run_abc",
    claimedAt: new Date().toISOString(),
    serverId: "srv_test",
    timeoutSeconds: 300,
    triggeredBy: "scheduler" as const,
    heartbeatInterval: null,
  }

  return { ctx, updateData, insertData }
}

// =============================================================================
// Tests
// =============================================================================

describe("finishJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mkdirMock.mockResolvedValue(undefined)
    writeFileMock.mockResolvedValue(undefined)
    renameMock.mockResolvedValue(undefined)
  })

  it("resets consecutive_failures to 0 on success", async () => {
    const { finishJob } = await import("../engine")
    const { ctx, updateData } = makeRunContext({ consecutiveFailures: 2 })

    await finishJob(ctx as never, { status: "success", durationMs: 100 })

    expect(updateData[0]).toMatchObject({ consecutive_failures: 0 })
  })

  it("disables non-cron job after max retries", async () => {
    const { finishJob } = await import("../engine")
    const { ctx, updateData } = makeRunContext({
      triggerType: "one-time",
      cronSchedule: null,
      consecutiveFailures: 2, // Will become 3 (>= maxRetries of 3)
    })

    await finishJob(ctx as never, { status: "failure", durationMs: 50, error: "boom" })

    expect(updateData[0]).toMatchObject({
      is_active: false,
      status: "disabled",
      consecutive_failures: 3,
    })
  })

  it("does NOT disable cron job after max retries — skips to next run instead", async () => {
    const { finishJob } = await import("../engine")
    const { ctx, updateData } = makeRunContext({
      triggerType: "cron",
      consecutiveFailures: 2, // Will become 3 (>= maxRetries of 3)
    })

    await finishJob(ctx as never, { status: "failure", durationMs: 50, error: "transient" })

    // Cron job should NOT be disabled
    expect(updateData[0]).toMatchObject({
      is_active: true,
      status: "idle",
      consecutive_failures: 0, // Reset after skipping to next cron run
    })

    // Should have computed next cron run
    expect(computeNextRunAtMsMock).toHaveBeenCalled()
    expect(updateData[0].next_run_at).toBeTruthy()
  })

  it("disables cron job when computeNextRunAtMs returns null at max retries", async () => {
    computeNextRunAtMsMock.mockReturnValueOnce(null)
    const { finishJob } = await import("../engine")
    const { ctx, updateData } = makeRunContext({
      triggerType: "cron",
      consecutiveFailures: 2,
    })

    await finishJob(ctx as never, { status: "failure", durationMs: 50, error: "bad cron" })

    expect(updateData[0]).toMatchObject({
      is_active: false,
      status: "disabled",
    })
    expect(updateData[0].next_run_at).toBeNull()
  })

  it("increments consecutive_failures and uses backoff before max retries", async () => {
    const { finishJob } = await import("../engine")
    const { ctx, updateData } = makeRunContext({ consecutiveFailures: 0 })

    await finishJob(ctx as never, { status: "failure", durationMs: 50, error: "oops" })

    expect(updateData[0]).toMatchObject({
      consecutive_failures: 1,
      is_active: true,
      status: "idle",
    })
    // Should have a retry time set (exponential backoff)
    expect(updateData[0].next_run_at).toBeTruthy()
  })

  it("disables webhook job after max retries", async () => {
    const { finishJob } = await import("../engine")
    const { ctx, updateData } = makeRunContext({
      triggerType: "webhook",
      cronSchedule: null,
      consecutiveFailures: 2,
    })

    await finishJob(ctx as never, { status: "failure", durationMs: 50, error: "webhook fail" })

    expect(updateData[0]).toMatchObject({
      is_active: false,
      status: "disabled",
      consecutive_failures: 3,
    })
  })

  it("disables email job after max retries", async () => {
    const { finishJob } = await import("../engine")
    const { ctx, updateData } = makeRunContext({
      triggerType: "email",
      cronSchedule: null,
      consecutiveFailures: 2,
    })

    await finishJob(ctx as never, { status: "failure", durationMs: 50, error: "email fail" })

    expect(updateData[0]).toMatchObject({
      is_active: false,
      status: "disabled",
      consecutive_failures: 3,
    })
  })

  it("calls onJobDisabled hook when job is disabled", async () => {
    const { finishJob } = await import("../engine")
    const { ctx } = makeRunContext({
      triggerType: "one-time",
      cronSchedule: null,
      consecutiveFailures: 2,
    })

    const onJobDisabled = vi.fn()
    const onJobFinished = vi.fn()

    await finishJob(ctx as never, {
      status: "failure",
      durationMs: 50,
      error: "fatal",
      hooks: { onJobDisabled, onJobFinished },
    })

    expect(onJobDisabled).toHaveBeenCalledOnce()
    expect(onJobDisabled).toHaveBeenCalledWith(expect.objectContaining({ job: ctx.job }), "fatal")
    expect(onJobFinished).toHaveBeenCalledOnce()
    expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ job: ctx.job }), "failure", undefined)
  })

  it("calls onJobFinished but NOT onJobDisabled on success", async () => {
    const { finishJob } = await import("../engine")
    const { ctx } = makeRunContext({ consecutiveFailures: 0 })

    const onJobDisabled = vi.fn()
    const onJobFinished = vi.fn()

    await finishJob(ctx as never, {
      status: "success",
      durationMs: 100,
      summary: "Done",
      hooks: { onJobDisabled, onJobFinished },
    })

    expect(onJobDisabled).not.toHaveBeenCalled()
    expect(onJobFinished).toHaveBeenCalledOnce()
    expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ job: ctx.job }), "success", "Done")
  })

  it("does not call onJobDisabled when one-time job disables after successful completion", async () => {
    const { finishJob } = await import("../engine")
    const { ctx, updateData } = makeRunContext({
      triggerType: "one-time",
      cronSchedule: null,
      consecutiveFailures: 0,
    })

    const onJobDisabled = vi.fn()
    const onJobFinished = vi.fn()

    await finishJob(ctx as never, {
      status: "success",
      durationMs: 100,
      summary: "Completed once",
      hooks: { onJobDisabled, onJobFinished },
    })

    expect(updateData[0]).toMatchObject({
      is_active: false,
      status: "disabled",
      consecutive_failures: 0,
    })
    expect(onJobDisabled).not.toHaveBeenCalled()
    expect(onJobFinished).toHaveBeenCalledOnce()
    expect(onJobFinished).toHaveBeenCalledWith(expect.objectContaining({ job: ctx.job }), "success", "Completed once")
  })

  it("does not call onJobDisabled when cron job skips to next run", async () => {
    const { finishJob } = await import("../engine")
    const { ctx } = makeRunContext({
      triggerType: "cron",
      consecutiveFailures: 2,
    })

    const onJobDisabled = vi.fn()
    const onJobFinished = vi.fn()

    await finishJob(ctx as never, {
      status: "failure",
      durationMs: 50,
      error: "transient",
      hooks: { onJobDisabled, onJobFinished },
    })

    // Cron jobs skip to next run instead of disabling
    expect(onJobDisabled).not.toHaveBeenCalled()
    expect(onJobFinished).toHaveBeenCalledOnce()
  })

  it("calls onJobDisabled when cron job has no next run", async () => {
    computeNextRunAtMsMock.mockReturnValueOnce(null)
    const { finishJob } = await import("../engine")
    const { ctx } = makeRunContext({
      triggerType: "cron",
      consecutiveFailures: 2,
    })

    const onJobDisabled = vi.fn()

    await finishJob(ctx as never, {
      status: "failure",
      durationMs: 50,
      error: "no next run",
      hooks: { onJobDisabled },
    })

    expect(onJobDisabled).toHaveBeenCalledOnce()
  })

  it("swallows errors from hooks without failing", async () => {
    const { finishJob } = await import("../engine")
    const { ctx } = makeRunContext({
      triggerType: "one-time",
      cronSchedule: null,
      consecutiveFailures: 2,
    })

    const onJobDisabled = vi.fn().mockRejectedValue(new Error("hook crashed"))
    const onJobFinished = vi.fn().mockRejectedValue(new Error("hook crashed"))

    // Should not throw
    await finishJob(ctx as never, {
      status: "failure",
      durationMs: 50,
      error: "boom",
      hooks: { onJobDisabled, onJobFinished },
    })

    expect(onJobDisabled).toHaveBeenCalled()
    expect(onJobFinished).toHaveBeenCalled()
  })
})
