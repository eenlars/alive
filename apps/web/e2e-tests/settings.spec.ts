import { expect, test } from "./fixtures"
import { gotoChatFast } from "./helpers/assertions"
import { TEST_TIMEOUTS } from "./fixtures/test-data"

/**
 * Settings overlay E2E tests
 *
 * Verifies the settings screen opens and renders key sections.
 * Uses authenticatedPage fixture - no login flow, state pre-injected.
 */

test("can open settings and see General tab", async ({ authenticatedPage, workerTenant }) => {
  // Capture console errors for debugging
  const consoleErrors: string[] = []
  authenticatedPage.on("console", msg => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })
  authenticatedPage.on("pageerror", err => {
    consoleErrors.push(`PAGE ERROR: ${err.message}`)
  })

  // Mock Flowglad billing API to prevent crashes for test users
  await authenticatedPage.route("**/api/flowglad/**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ loaded: true, pricingModel: null, billingPortalUrl: null }),
    }),
  )

  // Mock user credits API
  await authenticatedPage.route("**/api/credits**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ credits: 100 }),
    }),
  )

  await gotoChatFast(authenticatedPage, workerTenant.workspace, workerTenant.orgId)

  // Click the settings button
  const settingsButton = authenticatedPage.locator('[data-testid="settings-button"]')
  await expect(settingsButton).toBeVisible({ timeout: TEST_TIMEOUTS.medium })
  await settingsButton.click()

  // Settings overlay should appear
  const overlay = authenticatedPage.locator('[data-testid="settings-overlay"]')
  await expect(overlay).toBeVisible({ timeout: TEST_TIMEOUTS.max })

  // General tab content should be visible: model select, logout button
  const modelSelect = authenticatedPage.locator("#claude-model")
  const logoutButton = authenticatedPage.locator('[data-testid="logout-button"]')

  try {
    await expect(modelSelect).toBeAttached({ timeout: TEST_TIMEOUTS.medium })
    await expect(logoutButton).toBeAttached({ timeout: TEST_TIMEOUTS.fast })
  } catch (error) {
    // Dump console errors for debugging
    if (consoleErrors.length > 0) {
      console.error("[settings.spec] Console errors:", consoleErrors.join("\n"))
    }
    throw error
  }
})
