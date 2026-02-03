/**
 * E2E Test - Tab Isolation
 *
 * Tests that messages sent in different tabs use different session keys.
 * This is the CRITICAL isolation guarantee - each tab = separate Claude conversation.
 *
 * Strategy:
 * - Intercept API requests and capture the tabId from each request
 * - Verify different tabs send different tabIds
 * - This proves isolation at the protocol level, not just UI visibility
 *
 * Non-flaky by design:
 * - Wait for chat-ready (dexie + tab initialized), not just workspace-ready
 * - Wait for response text to appear (not button re-enabled - known timing issue)
 * - Use deterministic selectors (data-testid, data-tab-name)
 * - No timing-based assertions
 */

import { expect, type Request } from "@playwright/test"
import { test } from "./fixtures"
import { TEST_API } from "./fixtures/test-constants"
import { TEST_SELECTORS, TEST_TIMEOUTS } from "./fixtures/test-data"
import { handlers } from "./lib/handlers"
import { ChatPage } from "./pages/ChatPage"

/** Extract tabId from request body */
function getTabIdFromRequest(request: Request): string | null {
  const postData = request.postData()
  if (!postData) return null
  try {
    const body = JSON.parse(postData)
    return body.tabId || null
  } catch {
    return null
  }
}

/**
 * Wait for chat to be fully ready for sending messages.
 *
 * Strategy: Fill the message input and wait for the send button to become enabled.
 * This is the most reliable way to detect chat readiness because:
 * 1. The send button is disabled until `isReady` is true (Dexie session + tab initialized)
 * 2. It directly tests the condition needed before sending messages
 * 3. No race conditions with internal state initialization
 *
 * The test message is cleared after verification to avoid polluting the test.
 */
async function waitForChatReady(page: import("@playwright/test").Page) {
  const input = page.locator(TEST_SELECTORS.messageInput)
  const sendButton = page.locator(TEST_SELECTORS.sendButton)

  // Fill a test message to trigger enable check
  await input.fill("test")

  // Wait for send button to be enabled - this proves chat is ready
  await expect(sendButton).toBeEnabled({
    timeout: TEST_TIMEOUTS.max,
  })

  // Clear the test message
  await input.fill("")
}

/**
 * Send a message and wait for response - matches working test pattern
 */
async function sendAndWaitForResponse(
  page: import("@playwright/test").Page,
  chatPage: ChatPage,
  message: string,
  expectedResponse: string | RegExp,
) {
  await chatPage.sendMessage(message)
  // Wait for response to appear (not button re-enable - known timing issue with mocks)
  await expect(page.getByText(expectedResponse).first()).toBeVisible({
    timeout: TEST_TIMEOUTS.slow,
  })
}

test.describe("Tab Isolation", () => {
  test("different tabs send different tabIds to the API", async ({ authenticatedPage, workerTenant }) => {
    const page = authenticatedPage
    const chatPage = new ChatPage(page)

    // Track tabIds from requests
    const capturedTabIds: string[] = []

    // Mock API and capture tabId from each request
    let responseIndex = 0
    await page.route(`**${TEST_API.CLAUDE_STREAM}`, async route => {
      const tabId = getTabIdFromRequest(route.request())
      if (tabId) capturedTabIds.push(tabId)
      responseIndex++
      await handlers.text(`Response ${responseIndex}`)(route)
    })

    // Navigate and wait for full chat readiness
    await chatPage.gotoFast(workerTenant.workspace, workerTenant.orgId)
    await waitForChatReady(page)

    // Expand tabs bar
    const toggleTabsBtn = page.locator(TEST_SELECTORS.toggleTabsButton)
    if (await toggleTabsBtn.isVisible()) {
      await toggleTabsBtn.click()
      await expect(page.locator(TEST_SELECTORS.tabBar)).toBeVisible({
        timeout: TEST_TIMEOUTS.medium,
      })
    }

    // Send message in Tab 1
    await sendAndWaitForResponse(page, chatPage, "Message from Tab 1", "Response 1")

    // Create Tab 2
    await page.locator(TEST_SELECTORS.addTabButton).click()

    // Wait for Tab 2 to be active
    await expect(page.locator(`${TEST_SELECTORS.tabPrefix}${TEST_SELECTORS.activeTab}`)).toHaveAttribute(
      "data-tab-name",
      "Tab 2",
      { timeout: TEST_TIMEOUTS.medium },
    )

    // Wait for chat to be ready in new tab
    await waitForChatReady(page)

    // Send message in Tab 2
    await sendAndWaitForResponse(page, chatPage, "Message from Tab 2", "Response 2")

    // CRITICAL ASSERTION: We should have 2 requests with DIFFERENT tabIds
    expect(capturedTabIds).toHaveLength(2)
    expect(capturedTabIds[0]).toBeTruthy()
    expect(capturedTabIds[1]).toBeTruthy()
    expect(capturedTabIds[0]).not.toBe(capturedTabIds[1])
  })

  test("switching tabs preserves each tab's tabId", async ({ authenticatedPage, workerTenant }) => {
    const page = authenticatedPage
    const chatPage = new ChatPage(page)

    // Map tabId -> request count to track conversation continuity
    const tabIdRequestCounts = new Map<string, number>()

    let responseIndex = 0
    await page.route(`**${TEST_API.CLAUDE_STREAM}`, async route => {
      const tabId = getTabIdFromRequest(route.request())
      if (tabId) {
        tabIdRequestCounts.set(tabId, (tabIdRequestCounts.get(tabId) || 0) + 1)
      }
      responseIndex++
      await handlers.text(`Response ${responseIndex}`)(route)
    })

    await chatPage.gotoFast(workerTenant.workspace, workerTenant.orgId)
    await waitForChatReady(page)

    // Expand tabs
    const toggleTabsBtn = page.locator(TEST_SELECTORS.toggleTabsButton)
    if (await toggleTabsBtn.isVisible()) {
      await toggleTabsBtn.click()
      await expect(page.locator(TEST_SELECTORS.tabBar)).toBeVisible({
        timeout: TEST_TIMEOUTS.medium,
      })
    }

    // Send first message in Tab 1
    await sendAndWaitForResponse(page, chatPage, "Tab 1 - Message 1", "Response 1")

    // Create and switch to Tab 2
    await page.locator(TEST_SELECTORS.addTabButton).click()
    await expect(page.locator(`${TEST_SELECTORS.tabPrefix}${TEST_SELECTORS.activeTab}`)).toHaveAttribute(
      "data-tab-name",
      "Tab 2",
      { timeout: TEST_TIMEOUTS.medium },
    )
    await waitForChatReady(page)

    // Send message in Tab 2
    await sendAndWaitForResponse(page, chatPage, "Tab 2 - Message 1", "Response 2")

    // Switch back to Tab 1
    await page.locator('[data-tab-name="Tab 1"]').click()
    await expect(page.locator('[data-tab-name="Tab 1"]')).toHaveAttribute("data-active", "true", {
      timeout: TEST_TIMEOUTS.medium,
    })
    await waitForChatReady(page)

    // Send second message in Tab 1
    await sendAndWaitForResponse(page, chatPage, "Tab 1 - Message 2", "Response 3")

    // ASSERTIONS:
    // 1. Should have exactly 2 distinct tabIds
    expect(tabIdRequestCounts.size).toBe(2)

    // 2. Tab 1's tabId should have 2 requests (we sent 2 messages)
    // 3. Tab 2's tabId should have 1 request
    const counts = Array.from(tabIdRequestCounts.values()).sort((a, b) => b - a)
    expect(counts).toEqual([2, 1])
  })

  test("tabId in request matches UUID format", async ({ authenticatedPage, workerTenant }) => {
    const page = authenticatedPage
    const chatPage = new ChatPage(page)

    let capturedTabId: string | null = null

    await page.route(`**${TEST_API.CLAUDE_STREAM}`, async route => {
      capturedTabId = getTabIdFromRequest(route.request())
      await handlers.text("Response")(route)
    })

    await chatPage.gotoFast(workerTenant.workspace, workerTenant.orgId)
    await waitForChatReady(page)

    await sendAndWaitForResponse(page, chatPage, "Test message", "Response")

    // Verify tabId is a valid UUID
    expect(capturedTabId).toBeTruthy()
    expect(capturedTabId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })
})
