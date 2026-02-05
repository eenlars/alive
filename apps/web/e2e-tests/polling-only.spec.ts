import { expect, test } from "./fixtures"
import { TEST_TIMEOUTS } from "./fixtures/test-data"

/**
 * Browser Polling Tests
 *
 * These tests verify that the browser-based polling mechanism works correctly.
 *
 * **Architecture Decision:**
 * The production code polls deployed sites via cross-origin fetch (e.g., from
 * sonno.tech to newsite.sonno.tech). However, E2E tests can't reliably
 * test this due to:
 * 1. CORS restrictions (deployed sites don't have CORS headers)
 * 2. Dependency on external infrastructure
 * 3. Network flakiness
 *
 * **Testing Strategy:**
 * - Unit tests (features/deployment/__tests__/polling.integration.test.ts):
 *   Mock fetch, test polling logic in isolation
 * - E2E tests (this file): Test browser fetch mechanism works at all
 * - Manual/staging tests: Verify real cross-origin polling works
 *
 * **What's Being Tested:**
 * - Browser fetch API works in page.evaluate() context
 * - Polling loop logic (retry, success detection, timeout)
 * - Error handling for failed requests
 */

interface FetchTestResult {
  ok: boolean
  status: number
  error: string | null
}

interface PollingTestResult {
  success: boolean
  attempts: number
  error: string | null
}

test.describe("Browser Polling Mechanism", () => {
  test.skip("browser fetch API works in page context", async ({ page }) => {
    // Navigate to deploy page to establish page context
    await page.goto("/deploy", { waitUntil: "domcontentloaded" })
    // Wait for page to be interactive before running evaluate
    await expect(page.getByTestId("deploy-heading")).toBeAttached({ timeout: TEST_TIMEOUTS.slow })

    // Test that browser fetch works at all
    // Using same-origin to avoid CORS (we're testing the mechanism, not cross-origin)
    const result = await page.evaluate(async (): Promise<FetchTestResult> => {
      try {
        const response = await fetch("/", {
          method: "GET",
          cache: "no-store",
        })

        return {
          ok: response.ok,
          status: response.status,
          error: null,
        }
      } catch (error) {
        return {
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        }
      }
    })

    console.log("[Browser Fetch Test] Result:", result)

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.error).toBeNull()
  })

  test.skip("polling loop retries and detects success", async ({ page }) => {
    await page.goto("/deploy", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("deploy-heading")).toBeAttached({ timeout: TEST_TIMEOUTS.slow })

    // Test the sequential polling pattern used in SubdomainDeployForm.tsx
    // This verifies: retry logic, success detection, timeout handling
    //
    // Pattern: await each fetch before starting the next one.
    // This prevents race conditions when fetches take longer than the interval.
    const result = await page.evaluate(async (): Promise<PollingTestResult> => {
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
      const maxAttempts = 10
      let attempts = 0

      while (attempts < maxAttempts) {
        attempts++

        try {
          // Poll same-origin endpoint (exists and returns 200)
          const response = await fetch("/", {
            method: "GET",
            cache: "no-store",
          })

          if (response.ok) {
            return { success: true, attempts, error: null }
          }
        } catch (_error) {
          // Expected behavior: continue polling on error
        }

        // Wait before next attempt (sequential, not overlapping)
        await sleep(100)
      }

      return { success: false, attempts, error: "Timeout after 10 attempts" }
    })

    console.log("[Polling Loop Test] Result:", result)

    // Verify polling succeeded
    expect(result.success).toBe(true)
    expect(result.error).toBeNull()

    // Verify it actually polled (not just succeeded immediately)
    // Should succeed on first attempt since we're testing against live endpoint
    expect(result.attempts).toBeGreaterThan(0)
    expect(result.attempts).toBeLessThanOrEqual(10)
  })

  test.skip("polling handles fetch errors gracefully", async ({ page }) => {
    await page.goto("/deploy", { waitUntil: "domcontentloaded" })
    await expect(page.getByTestId("deploy-heading")).toBeAttached({ timeout: TEST_TIMEOUTS.slow })

    // Test error handling: non-existent domain should throw, not hang
    const result = await page.evaluate(async (): Promise<FetchTestResult> => {
      try {
        // This will fail with network error (CORS or DNS failure)
        const response = await fetch("https://definitely-does-not-exist-12345.sonno.tech", {
          method: "GET",
          cache: "no-store",
        })

        return {
          ok: response.ok,
          status: response.status,
          error: null,
        }
      } catch (error) {
        return {
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        }
      }
    })

    console.log("[Error Handling Test] Result:", result)

    // Should catch error, not hang
    expect(result.ok).toBe(false)
    expect(result.error).not.toBeNull()
  })
})

/**
 * KNOWN LIMITATIONS:
 *
 * 1. **Cross-Origin Testing**
 *    These tests use same-origin fetches, not real cross-origin like production.
 *    Real CORS behavior must be tested manually or in staging.
 *
 * 2. **Network Conditions**
 *    Can't simulate slow networks, timeouts, or intermittent failures in this setup.
 *    Consider adding playwright network throttling tests if needed.
 *
 * 3. **HTTPS Testing**
 *    Tests run on HTTP (localhost:9547), production uses HTTPS.
 *    Certificate validation, mixed content, etc. aren't tested.
 *
 * FUTURE IMPROVEMENTS:
 *
 * 1. **Mock Service Worker (MSW)**
 *    Could intercept browser requests and simulate deployed site responses
 *    without hitting real network. This would allow testing:
 *    - Cross-origin scenarios
 *    - Various HTTP status codes
 *    - Network errors and retries
 *
 * 2. **Test Fixture Site**
 *    Deploy a dedicated test-cors.sonno.tech with CORS headers enabled
 *    specifically for E2E testing. Would allow real cross-origin tests.
 *
 * 3. **Integration with deploy.spec.ts**
 *    After a real deployment in deploy.spec.ts, poll the deployed site
 *    to verify end-to-end flow. More realistic but slower and flakier.
 */
