/**
 * CronService Tests
 *
 * Tests the queue-based scheduler's public API and behavioral contracts.
 * The CronService is a singleton — each test cleans up via stopCronService() in afterEach.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ============================================
// Mock dependencies
// ============================================

vi.mock("@supabase/supabase-js", () => {
  const mockBuilder = () => {
    const b: Record<string, unknown> = {}
    const methods = ["select", "insert", "update", "delete", "eq", "is", "not", "or", "lt", "lte", "order", "limit"]
    for (const m of methods) b[m] = vi.fn(() => b)
    b.single = vi.fn(() => Promise.resolve({ data: null, error: null }))
    // biome-ignore lint/suspicious/noThenProperty: mock must be thenable for Supabase await pattern
    b.then = (resolve: (v: { data: null; error: null }) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve)
    return b
  }
  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => mockBuilder()),
    })),
  }
})

vi.mock("@webalive/shared", () => ({
  getServerId: vi.fn(() => "srv_test"),
}))

vi.mock("@webalive/automation", () => ({
  computeNextRunAtMs: vi.fn(() => Date.now() + 60_000),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceAppClient: vi.fn(() => ({
    from: vi.fn(() => {
      const b: Record<string, unknown> = {}
      const methods = ["select", "insert", "update", "delete", "eq", "is", "not", "or", "lt", "lte", "order", "limit"]
      for (const m of methods) b[m] = vi.fn(() => b)
      b.single = vi.fn(() => Promise.resolve({ data: null, error: null }))
      // biome-ignore lint/suspicious/noThenProperty: mock must be thenable for Supabase await pattern
      b.then = (resolve: (v: { data: null; error: null }) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return b
    }),
  })),
}))

vi.mock("./run-log", () => ({
  appendRunLog: vi.fn(() => Promise.resolve()),
}))

vi.mock("./executor", () => ({
  runAutomationJob: vi.fn(() => Promise.resolve({ success: true, durationMs: 100, response: "Done", messages: [] })),
}))

vi.mock("@/app/api/automations/events/route", () => ({
  broadcastAutomationEvent: vi.fn(),
}))

// ============================================
// Tests
// ============================================

describe("CronService", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(async () => {
    const mod = await import("../cron-service")
    mod.stopCronService()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe("lifecycle", () => {
    it("starts and reports running", async () => {
      const { startCronService, getCronServiceStatus } = await import("../cron-service")
      await startCronService({ enabled: true })

      const status = getCronServiceStatus()
      expect(status.started).toBe(true)
      expect(status.runningJobs).toBe(0)
    })

    it("stops cleanly", async () => {
      const { startCronService, stopCronService, getCronServiceStatus } = await import("../cron-service")
      await startCronService({ enabled: true })
      stopCronService()

      expect(getCronServiceStatus().started).toBe(false)
    })

    it("does not start when disabled", async () => {
      const { startCronService, getCronServiceStatus } = await import("../cron-service")
      await startCronService({ enabled: false })

      expect(getCronServiceStatus().started).toBe(false)
    })

    it("is idempotent (double-start is no-op)", async () => {
      const { startCronService, getCronServiceStatus } = await import("../cron-service")
      await startCronService({ enabled: true })
      await startCronService({ enabled: true })

      expect(getCronServiceStatus().started).toBe(true)
    })

    it("triggerJob returns error when not started", async () => {
      const { triggerJob } = await import("../cron-service")
      const result = await triggerJob("some-id")

      expect(result.success).toBe(false)
      expect(result.error).toBe("Service not started")
    })
  })

  describe("config contract", () => {
    it("accepts maxConcurrent, maxRetries, retryBaseDelayMs, onEvent, enabled", async () => {
      const { startCronService } = await import("../cron-service")

      // All valid config keys
      await startCronService({
        maxConcurrent: 5,
        maxRetries: 3,
        retryBaseDelayMs: 60_000,
        enabled: true,
        onEvent: () => {},
      })

      // Type assertion: CronServiceConfig SHOULD have retry fields
      type Config = Parameters<typeof startCronService>[0]
      type HasMaxRetries = "maxRetries" extends keyof NonNullable<Config> ? true : false
      type HasRetryDelay = "retryBaseDelayMs" extends keyof NonNullable<Config> ? true : false
      const _hasRetries: HasMaxRetries = true
      const _hasDelay: HasRetryDelay = true
      expect(_hasRetries).toBe(true)
      expect(_hasDelay).toBe(true)
    })
  })

  describe("event types", () => {
    it("CronEvent has started|finished actions and success|failure status", () => {
      // Compile-time verification: these are the valid values
      const startEvent: import("../cron-service").CronEvent = {
        jobId: "test",
        action: "started",
      }
      const finishEvent: import("../cron-service").CronEvent = {
        jobId: "test",
        action: "finished",
        status: "success",
        durationMs: 100,
      }
      const failEvent: import("../cron-service").CronEvent = {
        jobId: "test",
        action: "finished",
        status: "failure",
        error: "boom",
      }

      expect(startEvent.action).toBe("started")
      expect(finishEvent.status).toBe("success")
      expect(failEvent.status).toBe("failure")
    })
  })

  describe("status", () => {
    it("returns correct shape when not started", async () => {
      const { getCronServiceStatus } = await import("../cron-service")
      const status = getCronServiceStatus()

      expect(status).toEqual({ started: false, runningJobs: 0, nextWakeAt: null })
    })
  })
})
