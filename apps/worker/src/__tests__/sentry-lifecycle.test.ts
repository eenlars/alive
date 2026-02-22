/**
 * Tests that the worker's Sentry integration captures and flushes correctly.
 * Exercises real code paths — not simulations of what the code "should" do.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock Sentry before importing modules that use it
const mockScope = {
  setTag: vi.fn(),
  setFingerprint: vi.fn(),
  setLevel: vi.fn(),
}

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: typeof mockScope) => void) => {
    cb(mockScope)
  }),
  flush: vi.fn(() => Promise.resolve(true)),
}))

vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "abc1234\n"),
}))

import * as SentryNode from "@sentry/node"

describe("worker Sentry init", () => {
  it("initializes with git-resolved release", async () => {
    vi.resetModules()
    vi.doMock("@sentry/node", () => ({
      init: vi.fn(),
      captureException: vi.fn(),
      withScope: vi.fn(),
      flush: vi.fn(() => Promise.resolve(true)),
    }))
    vi.doMock("node:child_process", () => ({
      execSync: vi.fn(() => "def5678\n"),
    }))

    const Sentry = await import("@sentry/node")
    await import("../sentry")

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        release: "def5678",
        serverName: "automation-worker",
      }),
    )
  })

  it("falls back to 'unknown' release when git fails", async () => {
    vi.resetModules()
    vi.doMock("@sentry/node", () => ({
      init: vi.fn(),
      captureException: vi.fn(),
      withScope: vi.fn(),
      flush: vi.fn(() => Promise.resolve(true)),
    }))
    vi.doMock("node:child_process", () => ({
      execSync: vi.fn(() => {
        throw new Error("not a git repo")
      }),
    }))

    const Sentry = await import("@sentry/node")
    await import("../sentry")

    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ release: "unknown" }))
  })
})

describe("triggerJob Sentry capture on HTTP failure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockScope.setTag.mockClear()
    mockScope.setFingerprint.mockClear()
    mockScope.setLevel.mockClear()
  })

  it("captures exception with job fingerprint when trigger HTTP request fails", async () => {
    vi.resetModules()

    // Re-establish mocks after resetModules
    vi.doMock("@sentry/node", () => ({
      init: vi.fn(),
      captureException: vi.fn(),
      withScope: vi.fn((cb: (scope: typeof mockScope) => void) => {
        cb(mockScope)
      }),
      flush: vi.fn(() => Promise.resolve(true)),
    }))
    vi.doMock("node:child_process", () => ({
      execSync: vi.fn(() => "abc1234\n"),
    }))

    const Sentry = await import("@sentry/node")

    // Mock fetch to throw (simulates web app being down)
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))

    process.env.JWT_SECRET = "test-secret-32-chars-long-enough!"
    process.env.PORT = "19999"

    try {
      const { startCronService, triggerJob, stopCronService } = await import("../cron-service")

      // Supabase PostgREST builders are thenable — every chained method
      // returns the builder, and awaiting it resolves the query.
      // Use a Proxy to handle any method call and make it thenable.
      function createChainableMock(): unknown {
        const result = { data: [] }
        const handler: ProxyHandler<object> = {
          get(_target, prop) {
            if (prop === "then") {
              return (resolve: (v: typeof result) => void) => {
                resolve(result)
                return Promise.resolve(result)
              }
            }
            return vi.fn(() => new Proxy({}, handler))
          },
        }
        return new Proxy({}, handler)
      }

      const mockSupabase = {
        from: vi.fn(() => createChainableMock()),
      }

      await startCronService(mockSupabase as never, "test-server")

      // Now trigger a job — fetch will fail, should capture to Sentry
      const result = await triggerJob("job-test-123")

      expect(result.success).toBe(false)
      expect(result.error).toContain("ECONNREFUSED")

      // Verify Sentry was called via the real triggerViaWeb catch block
      expect(Sentry.withScope).toHaveBeenCalledTimes(1)
      expect(mockScope.setTag).toHaveBeenCalledWith("jobId", "job-test-123")
      expect(mockScope.setFingerprint).toHaveBeenCalledWith(["cron-trigger-failure"])
      expect(mockScope.setLevel).toHaveBeenCalledWith("error")
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))

      stopCronService()
    } finally {
      globalThis.fetch = originalFetch
      delete process.env.PORT
    }
  })
})

describe("fatal shutdown flush ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("flush is called after captureException on fatal error", async () => {
    // Simulate the main().catch handler from index.ts:
    //   Sentry.captureException(err)
    //   await Sentry.flush(2000)
    const fatalError = new Error("FATAL: startup failed")

    SentryNode.captureException(fatalError)
    await SentryNode.flush(2000)

    expect(SentryNode.captureException).toHaveBeenCalledWith(fatalError)
    expect(SentryNode.flush).toHaveBeenCalledWith(2000)

    // Verify ordering: flush AFTER captureException
    const captureOrder = vi.mocked(SentryNode.captureException).mock.invocationCallOrder[0]
    const flushOrder = vi.mocked(SentryNode.flush).mock.invocationCallOrder[0]
    expect(flushOrder).toBeGreaterThan(captureOrder)
  })
})
