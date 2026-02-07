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
  // Mock Flowglad billing API to prevent crashes for test users
  await authenticatedPage.route("**/api/flowglad/**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ loaded: true, pricingModel: null, billingPortalUrl: null }),
    }),
  )

  // Mock user API for test users
  await authenticatedPage.route("**/api/user", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          userId: workerTenant.userId,
          email: workerTenant.email,
          isAdmin: false,
          isSuperadmin: false,
          canSelectAnyModel: false,
          enabledModels: [],
        },
      }),
    }),
  )

  await gotoChatFast(authenticatedPage, workerTenant.workspace, workerTenant.orgId)

  // Click the settings button
  const settingsButton = authenticatedPage.locator('[data-testid="settings-button"]')
  await expect(settingsButton).toBeVisible({ timeout: TEST_TIMEOUTS.medium })
  await settingsButton.click()

  // Settings overlay should appear
  await expect(authenticatedPage.locator('[data-testid="settings-overlay"]')).toBeVisible({
    timeout: TEST_TIMEOUTS.max,
  })

  // General tab content should be visible: model select, logout button
  await expect(authenticatedPage.locator("#claude-model")).toBeAttached({ timeout: TEST_TIMEOUTS.medium })
  await expect(authenticatedPage.locator('[data-testid="logout-button"]')).toBeAttached({
    timeout: TEST_TIMEOUTS.fast,
  })
})
