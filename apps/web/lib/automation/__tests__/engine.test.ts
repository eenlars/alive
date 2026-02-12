/**
 * Automation Engine Tests
 *
 * Tests the unified claim/execute/finish lifecycle.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ============================================
// Mock dependencies
// ============================================

const mockUpdate = vi.fn()
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIs = vi.fn()
const mockSingle = vi.fn()

function createMockBuilder() {
  const b: Record<string, ReturnType<typeof vi.fn>> = {}
  b.select = mockSelect.mockReturnValue(b)
  b.insert = mockInsert.mockReturnValue(b)
  b.update = mockUpdate.mockReturnValue(b)
  b.eq = mockEq.mockReturnValue(b)
  b.is = mockIs.mockReturnValue(b)
  b.single = mockSingle
  // biome-ignore lint/suspicious/noThenProperty: mock must be thenable for Supabase await pattern
  b.then = undefined as unknown as ReturnType<typeof vi.fn>
  return b
}

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

vi.mock("@webalive/shared", () => ({
  getServerId: vi.fn(() => "srv_test"),
}))

vi.mock("@webalive/automation", () => ({
  computeNextRunAtMs: vi.fn(() => Date.now() + 60_000),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceAppClient: vi.fn(() => mockSupabase),
}))

vi.mock("../run-log", () => ({
  appendRunLog: vi.fn(() => Promise.resolve()),
}))

vi.mock("../executor", () => ({
  runAutomationJob: vi.fn(() => Promise.resolve({ success: true, durationMs: 100, response: "Done", messages: [] })),
}))

vi.mock("@/app/api/automations/events/route", () => ({
  broadcastAutomationEvent: vi.fn(),
}))

// ============================================
// Helpers
// ============================================

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job_123",
    name: "test-job",
    site_id: "site_456",
    user_id: "user_789",
    org_id: "org_abc",
    is_active: true,
    trigger_type: "cron" as const,
    action_type: "prompt" as const,
    action_prompt: "Do something",
    action_timeout_seconds: 300,
    action_model: null,
    action_thinking: null,
    action_source: null,
    action_target_page: null,
    action_format_prompt: null,
    cron_schedule: "0 * * * *",
    cron_timezone: null,
    consecutive_failures: 0,
    running_at: null,
    run_at: null,
    next_run_at: null,
    last_run_at: null,
    last_run_status: null,
    last_run_error: null,
    last_run_duration_ms: null,
    delete_after_run: false,
    skills: null,
    webhook_secret: null,
    description: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    run_id: null,
    claimed_by: null,
    lease_expires_at: null,
    ...overrides,
  }
}

// ============================================
// Tests
// ============================================

describe("Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("claimJob", () => {
    it("returns null when claim count is 0 (already claimed)", async () => {
      const { claimJob } = await import("../engine")

      // Mock: update returns count: 0
      const builder = createMockBuilder()
      mockFrom.mockReturnValue(builder)
      mockUpdate.mockReturnValue({ ...builder, count: 0, error: null })
      // Make eq/is return the same thing with count/error
      mockEq.mockReturnValue({ count: 0, error: null })
      mockIs.mockReturnValue({ count: 0, error: null, eq: mockEq })

      // Need to handle the chain: update().eq().is() returns {count, error}
      const chainResult = { count: 0, error: null }
      mockFrom.mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => Promise.resolve(chainResult)),
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { hostname: "test.com" }, error: null })),
          })),
        })),
      })

      const job = makeJob()
      const result = await claimJob(job, { supabase: mockSupabase as never, triggeredBy: "manual" })

      expect(result).toBeNull()
    })

    it("returns RunContext with correct fields when claim succeeds", async () => {
      const { claimJob } = await import("../engine")

      mockFrom.mockImplementation((table: string) => {
        if (table === "automation_jobs") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => Promise.resolve({ count: 1, error: null })),
              })),
            })),
          }
        }
        if (table === "domains") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { hostname: "example.com" }, error: null })),
              })),
            })),
          }
        }
        return createMockBuilder()
      })

      const job = makeJob()
      const result = await claimJob(job, {
        supabase: mockSupabase as never,
        triggeredBy: "scheduler",
        serverId: "srv_test",
      })

      expect(result).not.toBeNull()
      expect(result?.hostname).toBe("example.com")
      expect(result?.triggeredBy).toBe("scheduler")
      expect(result?.serverId).toBe("srv_test")
      expect(result?.runId).toBeDefined()
      expect(typeof result?.runId).toBe("string")
      expect(result?.heartbeatInterval).not.toBeNull()

      // Clean up heartbeat
      if (result?.heartbeatInterval) clearInterval(result.heartbeatInterval)
    })
  })

  describe("extractSummary", () => {
    it("returns undefined for empty input", async () => {
      const { extractSummary } = await import("../engine")
      expect(extractSummary(undefined)).toBeUndefined()
      expect(extractSummary("")).toBeUndefined()
    })

    it("returns first line for short text", async () => {
      const { extractSummary } = await import("../engine")
      expect(extractSummary("Added 3 articles")).toBe("Added 3 articles")
    })

    it("truncates long text at 200 chars", async () => {
      const { extractSummary } = await import("../engine")
      const long = "x".repeat(300)
      const result = extractSummary(long)
      expect(result?.length).toBeLessThanOrEqual(200)
      expect(result?.endsWith("...")).toBe(true)
    })

    it("takes only first line of multi-line text", async () => {
      const { extractSummary } = await import("../engine")
      expect(extractSummary("first line\nsecond line")).toBe("first line")
    })
  })

  describe("RunContext types", () => {
    it("exports expected types", async () => {
      const engine = await import("../engine")
      expect(typeof engine.claimJob).toBe("function")
      expect(typeof engine.executeJob).toBe("function")
      expect(typeof engine.finishJob).toBe("function")
      expect(typeof engine.extractSummary).toBe("function")
    })
  })
})
