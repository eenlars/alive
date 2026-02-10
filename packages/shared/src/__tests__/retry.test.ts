import { describe, expect, it, vi } from "vitest"
import { computeBackoff, resolveRetryConfig, retryAsync, sleepWithAbort } from "../retry"

describe("retry utilities", () => {
  describe("resolveRetryConfig", () => {
    it("should return defaults when no overrides", () => {
      const config = resolveRetryConfig()
      expect(config).toEqual({
        attempts: 3,
        minDelayMs: 300,
        maxDelayMs: 30_000,
        jitter: 0,
      })
    })

    it("should apply overrides", () => {
      const config = resolveRetryConfig(undefined, {
        attempts: 5,
        minDelayMs: 100,
        maxDelayMs: 5000,
        jitter: 0.2,
      })
      expect(config).toEqual({
        attempts: 5,
        minDelayMs: 100,
        maxDelayMs: 5000,
        jitter: 0.2,
      })
    })

    it("should clamp attempts to minimum 1", () => {
      const config = resolveRetryConfig(undefined, { attempts: 0 })
      expect(config.attempts).toBe(1)
    })

    it("should clamp jitter to 0-1 range", () => {
      expect(resolveRetryConfig(undefined, { jitter: -0.5 }).jitter).toBe(0)
      expect(resolveRetryConfig(undefined, { jitter: 1.5 }).jitter).toBe(1)
    })

    it("should ensure maxDelayMs >= minDelayMs", () => {
      const config = resolveRetryConfig(undefined, {
        minDelayMs: 1000,
        maxDelayMs: 500,
      })
      expect(config.maxDelayMs).toBe(1000)
    })
  })

  describe("retryAsync - simple mode", () => {
    it("should succeed on first attempt", async () => {
      const fn = vi.fn().mockResolvedValue("success")
      const result = await retryAsync(fn, 3)
      expect(result).toBe("success")
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("should retry on failure and succeed", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockRejectedValueOnce(new Error("fail 2"))
        .mockResolvedValue("success")

      // Use very short delays to make test fast
      const result = await retryAsync(fn, 3, 1)

      expect(result).toBe("success")
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it("should throw after all attempts exhausted", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("always fails"))

      await expect(retryAsync(fn, 3, 1)).rejects.toThrow("always fails")
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  describe("retryAsync - advanced mode", () => {
    it("should call onRetry callback", async () => {
      const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("success")

      const onRetry = vi.fn()

      await retryAsync(fn, {
        attempts: 3,
        minDelayMs: 1,
        onRetry,
        label: "test",
      })

      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          maxAttempts: 3,
          label: "test",
        }),
      )
    })

    it("should respect shouldRetry predicate", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("non-retryable"))

      const shouldRetry = vi.fn().mockReturnValue(false)

      await expect(
        retryAsync(fn, {
          attempts: 5,
          shouldRetry,
        }),
      ).rejects.toThrow("non-retryable")

      expect(fn).toHaveBeenCalledTimes(1)
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error), 1)
    })

    it("should stop retrying when shouldRetry returns false", async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(() => {
        attempts++
        return Promise.reject(new Error(`fail ${attempts}`))
      })

      // Only retry first 2 failures
      const shouldRetry = vi.fn().mockImplementation((_, attempt) => attempt < 2)

      await expect(
        retryAsync(fn, {
          attempts: 5,
          minDelayMs: 1,
          shouldRetry,
        }),
      ).rejects.toThrow("fail 2")

      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe("computeBackoff", () => {
    it("should compute exponential backoff", () => {
      const policy = { initialMs: 100, maxMs: 10000, factor: 2, jitter: 0 }

      expect(computeBackoff(policy, 1)).toBe(100)
      expect(computeBackoff(policy, 2)).toBe(200)
      expect(computeBackoff(policy, 3)).toBe(400)
      expect(computeBackoff(policy, 4)).toBe(800)
    })

    it("should cap at maxMs", () => {
      const policy = { initialMs: 100, maxMs: 500, factor: 2, jitter: 0 }

      expect(computeBackoff(policy, 10)).toBe(500)
    })

    it("should apply jitter", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5)

      const policy = { initialMs: 100, maxMs: 10000, factor: 2, jitter: 0.2 }
      const delay = computeBackoff(policy, 1)

      // 100 + (100 * 0.2 * 0.5) = 110
      expect(delay).toBe(110)

      vi.restoreAllMocks()
    })
  })

  describe("sleepWithAbort", () => {
    it("should resolve after delay", async () => {
      const start = Date.now()
      await sleepWithAbort(10)
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(9)
    })

    it("should resolve immediately for zero delay", async () => {
      const start = Date.now()
      await sleepWithAbort(0)
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(10)
    })

    it("should reject when aborted", async () => {
      const controller = new AbortController()
      const promise = sleepWithAbort(1000, controller.signal)

      // Abort immediately
      controller.abort()

      await expect(promise).rejects.toThrow("aborted")
    })

    it("should reject immediately if already aborted", async () => {
      const controller = new AbortController()
      controller.abort()

      await expect(sleepWithAbort(1000, controller.signal)).rejects.toThrow("aborted")
    })
  })
})
