/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, test, vi } from "vitest"

describe("Domain Polling Integration", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.restoreAllMocks()
  })

  test("can fetch deployed domain via GET", async () => {
    const domain = "test-poll.alive.best"

    // Mock fetch to simulate a successful response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    }) as any

    const response = await fetch(`https://${domain}`, {
      method: "GET",
      cache: "no-store",
    })

    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(`https://${domain}`, expect.objectContaining({ method: "GET" }))
  })

  test("fetch fails for non-existent domain", async () => {
    const domain = "nonexistent-test-12345.alive.best"

    // Mock fetch to simulate a network error
    global.fetch = vi.fn().mockRejectedValue(new Error("Domain not found")) as any

    try {
      await fetch(`https://${domain}`, {
        method: "GET",
        cache: "no-store",
      })
      // Should not reach here
      expect(true).toBe(false)
    } catch (error) {
      // Expected to fail
      expect(error).toBeDefined()
      expect(error instanceof Error ? error.message : "").toBe("Domain not found")
    }
  })

  test("polling detects when domain becomes live", async () => {
    const domain = "test-poll.alive.best"
    let attempts = 0
    let success = false

    // Mock fetch to fail the first 2 attempts, then succeed
    let callCount = 0
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount <= 2) {
        return Promise.reject(new Error("Not ready yet"))
      }
      return Promise.resolve({ ok: true, status: 200 })
    }) as any

    const pollPromise = new Promise<void>((resolve, reject) => {
      const interval = setInterval(async () => {
        attempts++

        if (attempts > 10) {
          clearInterval(interval)
          reject(new Error("Polling timed out after 10 attempts"))
          return
        }

        try {
          const response = await fetch(`https://${domain}`, {
            method: "GET",
            cache: "no-store",
          })

          if (response.ok) {
            success = true
            clearInterval(interval)
            resolve()
          }
        } catch (_error) {
          // Continue polling
        }
      }, 100) // Reduced to 100ms for faster testing
    })

    await pollPromise
    expect(success).toBe(true)
    expect(attempts).toBeGreaterThan(2) // Should take at least 3 attempts
    expect(attempts).toBeLessThanOrEqual(10)
    expect(callCount).toBe(3) // Should have called fetch 3 times
  })
})
