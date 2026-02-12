/**
 * CronService Worker Client Tests
 *
 * Tests the thin HTTP client that delegates to the automation worker.
 * The actual scheduling logic lives in apps/worker — these tests verify
 * the web app's interface to it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ============================================
// Mock fetch (worker HTTP calls)
// ============================================

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// ============================================
// Tests
// ============================================

describe("CronService Worker Client", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("pokeCronService", () => {
    it("is exported and callable", async () => {
      const { pokeCronService } = await import("../cron-service")
      expect(typeof pokeCronService).toBe("function")
    })

    it("POSTs to worker /poke endpoint", async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })))

      const { pokeCronService } = await import("../cron-service")
      pokeCronService()

      // Give the fire-and-forget fetch a tick to execute
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/poke"),
        expect.objectContaining({ method: "POST" }),
      )
    })

    it("does not throw when worker is unreachable", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"))

      const { pokeCronService } = await import("../cron-service")
      // Should not throw
      pokeCronService()
      await new Promise(resolve => setTimeout(resolve, 10))
    })
  })

  describe("getCronServiceStatus", () => {
    it("returns worker status when reachable", async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ started: true, runningJobs: 2 }), { status: 200 }))

      const { getCronServiceStatus } = await import("../cron-service")
      const status = await getCronServiceStatus()

      expect(status.started).toBe(true)
      expect(status.runningJobs).toBe(2)
    })

    it("returns default when worker is unreachable", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"))

      const { getCronServiceStatus } = await import("../cron-service")
      const status = await getCronServiceStatus()

      expect(status).toEqual({ started: false, runningJobs: 0, nextWakeAt: null })
    })
  })

  describe("startCronService (deprecated no-op)", () => {
    it("does not throw", async () => {
      const { startCronService } = await import("../cron-service")
      await startCronService()
    })
  })

  describe("stopCronService (deprecated no-op)", () => {
    it("does not throw", async () => {
      const { stopCronService } = await import("../cron-service")
      stopCronService()
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
})
