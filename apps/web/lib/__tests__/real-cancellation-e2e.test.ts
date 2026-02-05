/**
 * REAL E2E Cancellation Tests
 *
 * These tests use REAL API credits to verify cancellation works correctly.
 * They're designed with proper TDD principles:
 *
 * 1. NO FIXED TIMEOUTS - Poll actual state instead of guessing
 * 2. FAIL ON ANY ERROR - stream_error events should fail the test
 * 3. VERIFY BEHAVIOR - Test what should happen, not just "did it not crash"
 * 4. CLEAN STATE ASSERTIONS - Verify cleanup actually happened
 *
 * Run with:
 *   RUN_REAL_E2E=1 TEST_EMAIL=your@email.com TEST_PASSWORD=yourpass bun run test real-cancellation-e2e.test.ts
 *
 * Requirements:
 * - Dev server running (localhost:PORTS.DEV or DOMAINS.BRIDGE_DEV)
 * - Real Supabase user credentials
 * - RUN_REAL_E2E=1 to explicitly enable (safety flag)
 */

import { COOKIE_NAMES, DOMAINS, PORTS } from "@webalive/shared"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  assertNoStreamErrors,
  collectStreamEvents,
  extractTextFromEvents,
  fetchDebugState,
  waitFor,
  waitForCleanState,
} from "./test-utils"

// Explicit opt-in required - this uses real API credits!
const RUN_REAL_E2E = process.env.RUN_REAL_E2E === "1"

const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${PORTS.DEV}`
const TEST_EMAIL = process.env.TEST_EMAIL
const TEST_PASSWORD = process.env.TEST_PASSWORD
const TEST_WORKSPACE = process.env.TEST_WORKSPACE || DOMAINS.BRIDGE_PROD_HOST

// Skip unless explicitly enabled with credentials
const SKIP_REAL_API_TESTS = !RUN_REAL_E2E || !TEST_EMAIL || !TEST_PASSWORD

if (SKIP_REAL_API_TESTS) {
  console.log("[E2E] Skipping real cancellation tests")
  console.log("[E2E] To run: RUN_REAL_E2E=1 TEST_EMAIL=x TEST_PASSWORD=y bun run test real-cancellation-e2e.test.ts")
}

describe.skipIf(SKIP_REAL_API_TESTS)("REAL Cancellation E2E (uses API credits)", () => {
  let sessionCookie: string
  let tabId: string

  beforeAll(async () => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      throw new Error("TEST_EMAIL and TEST_PASSWORD must be set")
    }

    // Login to get session cookie
    console.log(`[E2E] Logging in as ${TEST_EMAIL} to ${BASE_URL}`)

    const loginRes = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        workspace: TEST_WORKSPACE,
      }),
    })

    if (!loginRes.ok) {
      const text = await loginRes.text()
      throw new Error(`Login failed: ${loginRes.status} - ${text}`)
    }

    // Extract session cookie
    const setCookieHeader = loginRes.headers.get("set-cookie")
    if (!setCookieHeader) {
      throw new Error("No session cookie returned")
    }

    const cookiePattern = new RegExp(`${COOKIE_NAMES.SESSION}=([^;]+)`)
    const match = setCookieHeader.match(cookiePattern)
    if (!match) {
      throw new Error(`Could not parse ${COOKIE_NAMES.SESSION} cookie`)
    }
    sessionCookie = `${COOKIE_NAMES.SESSION}=${match[1]}`

    // Generate unique tab ID
    tabId = crypto.randomUUID()

    console.log(`[E2E] Logged in successfully, tabId: ${tabId}`)
  }, 30000)

  // After each test, verify clean state
  afterEach(async () => {
    console.log("[E2E] Verifying clean state after test...")

    try {
      await waitForCleanState(BASE_URL, sessionCookie, {
        timeout: 10000,
        label: "post-test cleanup",
      })
      console.log("[E2E] Clean state verified")
    } catch (e) {
      console.error("[E2E] WARNING: State not clean after test:", e)
      // Log state for debugging
      const state = await fetchDebugState(BASE_URL, sessionCookie)
      console.error("[E2E] Final state:", JSON.stringify(state, null, 2))
    }
  })

  /**
   * Helper: Start a stream request and return control for cancellation
   */
  async function startStream(
    message: string,
    convId: string,
  ): Promise<{
    response: Response
    requestId: string
    abort: () => void
  }> {
    const abortController = new AbortController()

    const url = `${BASE_URL}/api/claude/stream`
    console.log(`[E2E DEBUG] URL: ${url}`)
    console.log(`[E2E DEBUG] Cookie: ${sessionCookie.substring(0, 50)}...`)

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        message,
        tabGroupId: convId,
        tabId: convId,
        workspace: TEST_WORKSPACE,
      }),
      signal: abortController.signal,
    })

    const requestId = response.headers.get("x-request-id") || "unknown"

    // Debug: log response body if not 200
    if (!response.ok) {
      const body = await response.clone().text()
      console.log(`[E2E DEBUG] Response body: ${body.substring(0, 500)}`)
    }

    return {
      response,
      requestId,
      abort: () => abortController.abort(),
    }
  }

  /**
   * Helper: Cancel a stream via the cancel endpoint
   */
  async function cancelStream(requestId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${BASE_URL}/api/claude/stream/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ requestId }),
    })

    return res.json()
  }

  /**
   * TEST 1: Basic cancellation releases lock
   *
   * Verifies that:
   * - Starting a stream acquires a lock
   * - Cancelling the stream releases the lock
   * - Worker becomes idle after cancellation
   */
  it("should release lock and free worker when stream is cancelled", async () => {
    const testConvId = crypto.randomUUID()
    console.log(`\n[E2E] Test 1: Basic cancellation (convId: ${testConvId})`)

    // Start stream
    const { response, requestId, abort } = await startStream("Count from 1 to 100 slowly", testConvId)
    console.log(`[E2E] Stream started, requestId: ${requestId}, status: ${response.status}`)

    expect(response.status).toBe(200)

    // Verify lock is held
    const stateBeforeCancel = await fetchDebugState(BASE_URL, sessionCookie)
    console.log(`[E2E] State before cancel: locks=${stateBeforeCancel.locks.count}`)
    expect(stateBeforeCancel.locks.count).toBeGreaterThan(0)

    // Cancel via endpoint
    console.log("[E2E] Calling cancel endpoint...")
    const cancelResult = await cancelStream(requestId)
    console.log(`[E2E] Cancel result: ${JSON.stringify(cancelResult)}`)

    // Abort the fetch to stop reading
    abort()

    // Wait for clean state - THIS IS THE KEY TEST
    // If cancellation is broken, this will timeout
    await waitForCleanState(BASE_URL, sessionCookie, {
      timeout: 5000,
      label: "cancellation cleanup",
    })

    console.log("[E2E] ✅ Lock released and worker idle after cancellation")
  }, 30000)

  /**
   * TEST 2: Cancel then send should succeed
   *
   * Verifies that:
   * - After cancellation completes, a new request to same conversation succeeds
   * - No 409 CONVERSATION_BUSY error
   * - Response contains actual content (not error)
   */
  it("should allow new request after cancellation completes", async () => {
    const testConvId = crypto.randomUUID()
    console.log(`\n[E2E] Test 2: Cancel then send (convId: ${testConvId})`)

    // First request - start and cancel
    const { response: res1, requestId, abort } = await startStream("What is 2+2?", testConvId)
    console.log(`[E2E] First request started: ${requestId}`)
    expect(res1.status).toBe(200)

    await cancelStream(requestId)
    abort()

    // Wait for cleanup - NOT a fixed timeout!
    await waitForCleanState(BASE_URL, sessionCookie, {
      timeout: 5000,
      label: "first request cleanup",
    })

    console.log("[E2E] First request cancelled, state is clean")

    // Second request - should succeed WITHOUT 409
    console.log("[E2E] Sending second request...")
    const { response: res2 } = await startStream("What is 2+2?", testConvId)

    console.log(`[E2E] Second request status: ${res2.status}`)

    // THIS IS THE KEY ASSERTION - we should NOT get 409
    expect(res2.status).not.toBe(409)
    expect(res2.status).toBe(200)

    // Read and verify response - we test the stream, not Claude's exact output
    const events = await collectStreamEvents(res2, { failOnError: true })
    assertNoStreamErrors(events)

    // Verify we got assistant content (any content - we're testing the stream, not Claude)
    const text = extractTextFromEvents(events)
    console.log(`[E2E] Response text: "${text.substring(0, 100)}..."`)
    expect(text.length).toBeGreaterThan(0)

    // Verify completion event
    const completeEvents = events.filter(e => e.type === "complete" || e.type === "stream_complete")
    expect(completeEvents.length).toBeGreaterThan(0)

    console.log("[E2E] ✅ Second request succeeded after cancellation")
  }, 60000)

  /**
   * TEST 3: Rapid cancellation stress test
   *
   * Verifies that:
   * - Multiple rapid send+cancel cycles don't leave orphaned locks
   * - Final request after multiple cancellations succeeds
   * - All cleanup happens correctly
   */
  it("should handle multiple rapid send+cancel cycles", async () => {
    const testConvId = crypto.randomUUID()
    console.log(`\n[E2E] Test 3: Rapid cancellation stress test (convId: ${testConvId})`)

    const cycles = 3

    for (let i = 1; i <= cycles; i++) {
      console.log(`[E2E] Cycle ${i}/${cycles}: Starting...`)

      const { response, requestId, abort } = await startStream(`Rapid test ${i}`, testConvId)
      console.log(`[E2E] Cycle ${i}: requestId=${requestId}, status=${response.status}`)

      // Cancel immediately
      await cancelStream(requestId)
      abort()

      // Wait for clean state BEFORE next cycle
      await waitForCleanState(BASE_URL, sessionCookie, {
        timeout: 5000,
        label: `cycle ${i} cleanup`,
      })

      console.log(`[E2E] Cycle ${i}: Cleanup complete`)
    }

    // Final request should work
    console.log("[E2E] Sending final request after all cancellations...")
    const { response } = await startStream("What is 3+3?", testConvId)

    expect(response.status).not.toBe(409)
    expect(response.status).toBe(200)

    // Verify stream completes with content - we test the stream, not Claude
    const events = await collectStreamEvents(response, { failOnError: true })
    assertNoStreamErrors(events)

    const text = extractTextFromEvents(events)
    expect(text.length).toBeGreaterThan(0)

    const completeEvents = events.filter(e => e.type === "complete" || e.type === "stream_complete")
    expect(completeEvents.length).toBeGreaterThan(0)

    console.log("[E2E] ✅ Rapid cancellation stress test passed")
  }, 120000)

  /**
   * TEST 4: Worker pool state verification
   *
   * Verifies that:
   * - Worker state transitions correctly (idle → busy → idle)
   * - Debug endpoint accurately reflects worker state
   */
  it("should show correct worker state transitions", async () => {
    const testConvId = crypto.randomUUID()
    console.log(`\n[E2E] Test 4: Worker state verification (convId: ${testConvId})`)

    // Check initial state
    const initialState = await fetchDebugState(BASE_URL, sessionCookie)
    console.log(`[E2E] Initial active workers: ${initialState.workerPool.stats?.activeWorkers ?? "N/A"}`)

    // Start stream - worker should become busy
    const { response, requestId, abort } = await startStream("Count to 50", testConvId)
    expect(response.status).toBe(200)

    // Poll for activity state - lock is acquired synchronously before response headers
    // so it should be immediately visible, but we poll to be safe
    await waitFor(
      async () => {
        const state = await fetchDebugState(BASE_URL, sessionCookie)
        return (
          state.locks.count > 0 ||
          (state.workerPool.stats?.activeWorkers ?? 0) > 0 ||
          state.cancellationRegistry.count > 0
        )
      },
      {
        timeout: 2000,
        interval: 50,
        message: "Expected activity (lock/worker/registry) during stream",
      },
    )

    // Log state for debugging
    const duringState = await fetchDebugState(BASE_URL, sessionCookie)
    console.log(`[E2E] During stream: locks=${duringState.locks.count}`)

    // Cancel and verify cleanup
    await cancelStream(requestId)
    abort()

    await waitForCleanState(BASE_URL, sessionCookie, {
      timeout: 5000,
      label: "worker state cleanup",
    })

    // Verify final state
    const finalState = await fetchDebugState(BASE_URL, sessionCookie)
    console.log("[E2E] Final state:")
    console.log(`  - Locks: ${finalState.locks.count}`)
    console.log(`  - Registry: ${finalState.cancellationRegistry.count}`)
    console.log(`  - Active workers: ${finalState.workerPool.stats?.activeWorkers ?? "N/A"}`)

    expect(finalState.locks.count).toBe(0)
    expect(finalState.cancellationRegistry.count).toBe(0)
    if (finalState.workerPool.stats) {
      expect(finalState.workerPool.stats.activeWorkers).toBe(0)
    }

    console.log("[E2E] ✅ Worker state transitions verified")
  }, 30000)

  /**
   * TEST 5: Error-free completion
   *
   * Verifies that:
   * - A normal request completes without any stream_error events
   * - Response contains expected content
   */
  it("should complete request without errors", async () => {
    const testConvId = crypto.randomUUID()
    console.log(`\n[E2E] Test 5: Error-free completion (convId: ${testConvId})`)

    const { response } = await startStream("What is 1+1?", testConvId)

    expect(response.status).toBe(200)

    // Collect events - this will FAIL if any stream_error is found
    const events = await collectStreamEvents(response, { failOnError: true })

    // Explicit assertion - no errors should have been collected
    assertNoStreamErrors(events)

    // Verify we got assistant content - we test the stream, not Claude's exact words
    const text = extractTextFromEvents(events)
    expect(text.length).toBeGreaterThan(0)

    // Verify we got a completion event
    const completeEvents = events.filter(e => e.type === "stream_complete" || e.type === "complete")
    expect(completeEvents.length).toBeGreaterThan(0)

    console.log("[E2E] ✅ Request completed cleanly without errors")
  }, 60000)
})
