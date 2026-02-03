import { expect, test } from "./fixtures"
import { gotoChatFast } from "./helpers/assertions"
import { handlers } from "./lib/handlers"

/**
 * Chat tests using pre-authenticated page (fast)
 *
 * Uses authenticatedPage fixture - no login flow, state pre-injected.
 */

test.skip("has chat interface", async ({ authenticatedPage, workerTenant }) => {
  await gotoChatFast(authenticatedPage, workerTenant.workspace, workerTenant.orgId)

  await expect(authenticatedPage.locator('[data-testid="message-input"]')).toBeVisible({ timeout: 2000 })
  await expect(authenticatedPage.locator('[data-testid="send-button"]')).toBeVisible({ timeout: 1000 })
})

test.skip("can send a message and receive response", async ({ authenticatedPage, workerTenant }) => {
  // Register mock BEFORE navigating
  await authenticatedPage.route("**/api/claude/stream", handlers.text("Hi there! How can I help you today?"))

  await gotoChatFast(authenticatedPage, workerTenant.workspace, workerTenant.orgId)

  const messageInput = authenticatedPage.locator('[data-testid="message-input"]')
  const sendButton = authenticatedPage.locator('[data-testid="send-button"]')

  await messageInput.fill("Hello")
  await expect(sendButton).toBeEnabled({ timeout: 2000 })
  await sendButton.click()

  // Use .first() to avoid strict mode violations (message appears in sidebar + chat)
  await expect(authenticatedPage.getByText("Hello").first()).toBeVisible({ timeout: 3000 })
  await expect(authenticatedPage.getByText(/Hi there.*help you today/).first()).toBeVisible({ timeout: 3000 })
})
