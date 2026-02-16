import { expect, test } from "./fixtures"
import { TEST_TIMEOUTS } from "./fixtures/test-data"
import { gotoChatFast } from "./helpers/assertions"
import { buildJsonMockResponse } from "./lib/strict-api-guard"

/**
 * Settings overlay E2E tests
 *
 * Verifies the settings screen opens and renders key sections.
 * Uses authenticatedPage fixture - no login flow, state pre-injected.
 *
 * IMPORTANT: The FlowgladProvider in the layout makes API calls to /api/flowglad
 * which can crash for E2E test users (no Flowglad customer record). Additionally,
 * if @tanstack/react-query is duplicated (Flowglad pins its own version), the
 * QueryClientProvider context breaks with "No QueryClient set". We mock all
 * billing-related APIs to isolate the test from these issues.
 */

test("can open settings and see General tab", async ({ authenticatedPage, workerTenant }) => {
  // Mock Flowglad billing API to prevent crashes for test users.
  // The FlowgladProvider calls /api/flowglad/GetCustomerBilling on mount.
  // For E2E test users, the server throws "Test accounts are not eligible for billing".
  // This mock returns an empty billing state so the provider initializes cleanly.
  await authenticatedPage.route("**/api/flowglad/**", route =>
    route.fulfill(buildJsonMockResponse({ data: null, error: null })),
  )

  // Mock /api/user to return a valid user for the test account.
  // This ensures useAuth() returns user data without hitting the real DB.
  await authenticatedPage.route("**/api/user**", route =>
    route.fulfill(
      buildJsonMockResponse({
        user: {
          id: workerTenant.userId,
          email: workerTenant.email,
          name: workerTenant.orgName,
          isAdmin: false,
          isSuperadmin: false,
          canSelectAnyModel: false,
          enabledModels: [],
        },
      }),
    ),
  )

  // Mock /api/tokens to prevent credit-fetching errors
  await authenticatedPage.route("**/api/tokens**", route =>
    route.fulfill(buildJsonMockResponse({ ok: true, credits: 100, tokens: 100000 })),
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
