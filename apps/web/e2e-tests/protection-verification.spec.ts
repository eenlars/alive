/**
 * Protection Verification Tests
 *
 * These tests verify that BOTH layers of protection work:
 * - Layer 1: Browser request monitoring
 * - Layer 2: Server-side blocking
 *
 * NOTE: Some tests require a local test environment with PLAYWRIGHT_TEST=true
 * and BRIDGE_ENV=local set on the server. These are skipped on remote environments
 * (staging and production).
 */

import { SECURITY } from "@webalive/shared"
import { expect, test } from "./fixtures"
import { TEST_TIMEOUTS } from "./fixtures/test-data"
import { login } from "./helpers"
import { gotoChatFast, waitForChatReady } from "./helpers/assertions"
import { handlers } from "./lib/handlers"
import { isLocalTestServer } from "./lib/test-env"

test.describe("Protection System Verification", () => {
  test("Layer 1: Catches unmocked calls at browser level", async ({ authenticatedPage, workerTenant }) => {
    // Register our own request monitor to verify Layer 1 works
    const apiCalls: string[] = []
    authenticatedPage.on("request", req => {
      if (req.url().includes("/api/claude")) {
        apiCalls.push(req.url())
      }
    })

    // Register handler BEFORE navigation - Layer 1 should allow this through
    await authenticatedPage.route("**/api/claude/stream", handlers.text("Protected!"))

    // Use fast navigation with pre-injected state
    await gotoChatFast(authenticatedPage, workerTenant.workspace, workerTenant.orgId)

    // Wait for chat to be fully ready (Dexie + tab initialized)
    await waitForChatReady(authenticatedPage)

    // Now send the actual test message
    const messageInput = authenticatedPage.locator('[data-testid="message-input"]')
    const sendButton = authenticatedPage.locator('[data-testid="send-button"]')
    await messageInput.fill("Test message")
    await sendButton.click()

    // Wait for response (use .first() to avoid strict mode violations)
    // Use slow timeout as this depends on mock handler processing
    await expect(authenticatedPage.getByText("Protected!").first()).toBeVisible({ timeout: TEST_TIMEOUTS.slow })

    // Verify the API call was made (but mocked)
    expect(apiCalls.length).toBeGreaterThan(0)
    expect(apiCalls[0]).toContain("/api/claude/stream")
  })

  // This test requires PLAYWRIGHT_TEST=true on the server (local test env only)
  // Purpose: Verify that real Claude API calls are blocked by server-side protection
  test.skip("Layer 2: Server blocks calls when PLAYWRIGHT_TEST=true", async ({ page, tenant }) => {
    test.skip(!isLocalTestServer, "Requires local test server with PLAYWRIGHT_TEST=true")

    // Just need auth - don't need the full chat UI
    await login(page, tenant)

    // Make a direct fetch to the API (bypass Playwright routing)
    // This tests that the SERVER blocks real API calls, regardless of UI state
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/claude/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "This should be blocked",
          tabGroupId: crypto.randomUUID(),
          tabId: crypto.randomUUID(),
        }),
      })
      return {
        status: res.status,
        body: await res.json(),
      }
    })

    // Verify Layer 2 blocked it
    expect(response.status).toBe(403)
    expect(response.body.error).toBe("TEST_MODE_BLOCK")
    expect(response.body.message).toContain("test mode")
  })

  // This test uses test credentials from SECURITY.LOCAL_TEST that only work with BRIDGE_ENV=local
  // Purpose: Verify that non-Claude APIs (login) work and aren't blocked by PLAYWRIGHT_TEST=true
  test.skip("Allows non-Claude API calls (login, verify, etc)", async ({ page }) => {
    test.skip(!isLocalTestServer, "Requires local test server with BRIDGE_ENV=local credentials")
    // Login should work - it's NOT a protected endpoint
    await page.goto("/")
    await page.getByTestId("email-input").fill(SECURITY.LOCAL_TEST.EMAIL)
    await page.getByTestId("password-input").fill(SECURITY.LOCAL_TEST.PASSWORD)

    // Wait for login response
    const loginResponsePromise = page.waitForResponse(
      response => response.url().includes("/api/login") && response.request().method() === "POST",
    )
    await page.getByTestId("login-button").click()
    const loginResponse = await loginResponsePromise

    // Verify login succeeded - this is the main assertion
    // If PLAYWRIGHT_TEST was blocking non-Claude APIs, this would fail
    expect(loginResponse.ok()).toBe(true)

    // Verify response contains auth data (proves the API returned properly)
    const data = await loginResponse.json()
    expect(data).toHaveProperty("ok", true)
  })
})
