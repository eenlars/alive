/**
 * E2E Test - Chat API Request Validation
 *
 * Tests the actual bug: INVALID_REQUEST error when sending chat messages
 * Uses real API calls to verify the full request/response flow works.
 *
 * Run with: bun run test:e2e:genuine
 *
 * Prerequisites:
 * - Test workspace created by globalSetup (e2e-tests/genuine-setup.ts)
 * - Local test server running on port 9548 (STREAM_ENV=local)
 * - ANTHROPIC_API_KEY in .env
 */

import { expect, type Page, type Request, type Response, test } from "@playwright/test"
import { PATTERNS, TEST_API, TEST_MESSAGES, TEST_MODELS } from "./fixtures/test-constants"
import { TEST_TIMEOUTS, TEST_USER } from "./fixtures/test-data"

/**
 * Type-safe chat request body
 */
interface ChatRequest {
  message: string
  tabId: string
  model: string
  workspace: string
}

/**
 * Type-safe error response
 */
interface ErrorResponse {
  ok: false
  error: string
  message: string
  category?: string
}

/**
 * Login helper for genuine tests
 * Uses TEST_USER fixture for consistent credentials
 *
 * Waits for specific elements instead of networkidle (which is flaky under load)
 *
 * @param page - Playwright page object
 */
async function loginGenuine(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByTestId("email-input").fill(TEST_USER.email)
  await page.getByTestId("password-input").fill(TEST_USER.password)
  await page.getByTestId("login-button").click()

  // Wait for navigation to /chat (event-based, not timeout)
  await page.waitForURL("/chat", { timeout: TEST_TIMEOUTS.max })

  // Wait for workspace to be ready - use specific element, not networkidle
  // networkidle is flaky: "no network for 500ms" can fail if anything fires at 501ms
  await expect(page.locator('[data-testid="workspace-ready"]')).toBeAttached({
    timeout: TEST_TIMEOUTS.slow,
  })
}

test.describe("Chat API - Request Validation", () => {
  test("can send message without INVALID_REQUEST error", async ({ page }) => {
    await loginGenuine(page)

    // Verify chat interface is ready (using data-testids)
    await expect(page.locator('[data-testid="message-input"]')).toBeVisible({
      timeout: TEST_TIMEOUTS.max,
    })
    await expect(page.locator('[data-testid="send-button"]')).toBeVisible()

    // Type a simple message (using constant, not hardcoded)
    const messageInput = page.locator('[data-testid="message-input"]')
    await messageInput.fill(TEST_MESSAGES.SIMPLE)

    // Setup request/response promises BEFORE clicking send (event-based approach)
    const requestPromise = page.waitForRequest(
      (req: Request) => req.url().includes(TEST_API.CLAUDE_STREAM) && req.method() === "POST",
    )

    const responsePromise = page.waitForResponse(
      (res: Response) => res.url().includes(TEST_API.CLAUDE_STREAM) && res.request().method() === "POST",
    )

    // Send the message
    const sendButton = page.locator('[data-testid="send-button"]')
    await Promise.all([
      requestPromise,
      responsePromise,
      sendButton.click(), // Click triggers both request and response
    ])

    // Get the captured request and response
    const request = await requestPromise
    const response = await responsePromise

    // Parse request body (type-safe)
    const postData = request.postData()
    expect(postData).toBeTruthy()

    const requestBody: ChatRequest = JSON.parse(postData!)
    console.log("📤 Request body:", requestBody)

    // Verify request structure (using constants)
    expect(requestBody.message).toBe(TEST_MESSAGES.SIMPLE)
    expect(requestBody.tabId).toMatch(PATTERNS.UUID)
    expect(requestBody.model).toBe(TEST_MODELS.HAIKU)
    expect(requestBody.workspace).toBe(TEST_USER.workspace)
    console.log("✅ Request structure valid")

    // Verify response status
    const responseStatus = response.status()
    console.log("📥 Response status:", responseStatus)

    // If error response, parse and fail explicitly
    if (responseStatus !== 200) {
      const errorBody: ErrorResponse = await response.json()
      console.error("❌ Error response:", errorBody)

      if (errorBody.error === "INVALID_REQUEST") {
        throw new Error(`INVALID_REQUEST error: ${errorBody.message}`)
      }

      throw new Error(`API error (${responseStatus}): ${errorBody.error} - ${errorBody.message}`)
    }

    // Verify user message appears in UI
    // Note: Using data-testid would be better, but getByText is acceptable for message content
    await expect(page.getByText(TEST_MESSAGES.SIMPLE).first()).toBeVisible({
      timeout: TEST_TIMEOUTS.slow,
    })
    console.log("✅ User message displayed")

    // Verify Claude starts thinking (using data-testid, not brittle text selector)
    await expect(page.locator('[data-testid="thinking-indicator"]')).toBeVisible({
      timeout: TEST_TIMEOUTS.slow,
    })
    console.log("✅ Claude response started (no INVALID_REQUEST error)")

    console.log("✅ Test passed - chat works without INVALID_REQUEST error")
  })

  test("handles insufficient tokens gracefully", async ({ page }) => {
    await loginGenuine(page)

    await expect(page.locator('[data-testid="message-input"]')).toBeVisible({
      timeout: TEST_TIMEOUTS.max,
    })

    const messageInput = page.locator('[data-testid="message-input"]')
    await messageInput.fill(TEST_MESSAGES.SIMPLE)

    const responsePromise = page.waitForResponse(
      (res: Response) => res.url().includes(TEST_API.CLAUDE_STREAM) && res.request().method() === "POST",
    )

    const sendButton = page.locator('[data-testid="send-button"]')
    await sendButton.click()

    const response = await responsePromise
    const status = response.status()

    // Test should handle both success (200) and insufficient tokens (402/403)
    // This makes the test resilient to credit/token availability
    if (status === 200) {
      console.log("✅ Request succeeded (user has credits)")
    } else if (status === 402 || status === 403) {
      const errorBody: ErrorResponse = await response.json()
      console.log("✅ Request blocked due to insufficient tokens (expected):", errorBody.error)
      expect(errorBody.error).toMatch(/INSUFFICIENT_TOKENS|TEST_MODE_BLOCK/)
    } else {
      throw new Error(`Unexpected status ${status}`)
    }
  })
})
